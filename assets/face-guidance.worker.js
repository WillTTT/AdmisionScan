const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detector = null;
let closing = false;
let lastTimestamp = -1;

function blockLibraryMetrics() {
  if (typeof globalThis.fetch !== "function") return;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    let url = "";
    try {
      url = typeof input === "string" ? input : String(input && input.url || "");
    } catch (_) {}
    if (url.indexOf("odml.pa.googleapis.com") !== -1) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return originalFetch.call(this, input, init);
  };
}

function closeDetector() {
  if (!detector) return;
  try { detector.close(); } catch (_) {}
  detector = null;
}

async function initialize() {
  let stage = "import";
  try {
    blockLibraryMetrics();
    const vision = await import(VISION_URL);
    if (closing) return;

    stage = "wasm";
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE, true);
    if (closing) return;

    stage = "model";
    detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });
    if (closing) {
      closeDetector();
      return;
    }
    self.postMessage({ type: "ready" });
  } catch (error) {
    closeDetector();
    if (!closing) {
      self.postMessage({
        type: "error",
        stage,
        message: error && error.message ? error.message : String(error),
      });
    }
  }
}

function serializeDetections(result) {
  const detections = result && Array.isArray(result.detections) ? result.detections : [];
  return detections.map(function (item) {
    const box = item && item.boundingBox;
    const categories = item && Array.isArray(item.categories) ? item.categories : [];
    const keypoints = item && Array.isArray(item.keypoints) ? item.keypoints : [];
    return {
      boundingBox: box ? {
        originX: Number(box.originX),
        originY: Number(box.originY),
        width: Number(box.width),
        height: Number(box.height),
      } : null,
      categories: categories.map(function (category) {
        return { score: Number(category && category.score) };
      }),
      keypoints: keypoints.map(function (point) {
        return { x: Number(point && point.x), y: Number(point && point.y) };
      }),
    };
  });
}

function detectFrame(data) {
  const bitmap = data && data.bitmap;
  if (!bitmap) return;
  try {
    if (closing || !detector) return;
    const timestamp = Number(data.timestampMs);
    if (!Number.isFinite(timestamp) || timestamp <= lastTimestamp) {
      throw new Error("Timestamp de fotograma no monótono");
    }
    lastTimestamp = timestamp;
    const detections = detector.detectForVideo(bitmap, timestamp);
    self.postMessage({
      type: "result",
      id: data.id,
      width: bitmap.width,
      height: bitmap.height,
      detections: serializeDetections(detections),
    });
  } catch (error) {
    if (!closing) {
      self.postMessage({
        type: "error",
        stage: "detect",
        message: error && error.message ? error.message : String(error),
      });
    }
  } finally {
    try { bitmap.close(); } catch (_) {}
  }
}

self.addEventListener("message", function (event) {
  const data = event.data || {};
  if (data.type === "init") {
    if (!detector && !closing) void initialize();
    return;
  }
  if (data.type === "frame") {
    detectFrame(data);
    return;
  }
  if (data.type === "close") {
    closing = true;
    closeDetector();
    self.postMessage({ type: "closed" });
    self.close();
  }
});
