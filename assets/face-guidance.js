const MESSAGES = {
  loading: "Cargando detección facial…",
  unavailable: "Asistencia no disponible. Puedes ajustar la posición manualmente",
  no_face: "Coloca tu rostro frente a la cámara",
  too_close: "Aléjate un poco",
  too_far: "Acércate un poco",
  too_left: "Muévete un poco hacia la izquierda",
  too_right: "Muévete un poco hacia la derecha",
  too_high: "Desplázate un poco hacia abajo",
  too_low: "Desplázate un poco hacia arriba",
  tilted: "Mantén la cabeza recta",
  perfect: "¡Perfecto! Mantén la posición",
  multiple_faces: "Asegúrate de ser la única persona en la imagen",
  steady: "Ajusta ligeramente la posición",
};

const CONFIG = {
  INFER_INTERVAL_MS: 100,
  TARGET_CENTER_X: 0.5,
  COMPOSITION_CENTER_Y: 0.40,
  CENTER_ENTER_X: 0.08,
  CENTER_EXIT_X: 0.04,
  AREA_MIN_ENTER: 0.06,
  AREA_MIN_EXIT: 0.075,
  AREA_MAX_ENTER: 0.30,
  AREA_MAX_EXIT: 0.26,
  ROLL_ENTER_DEG: 8,
  ROLL_EXIT_DEG: 6,
  MIN_SCORE_PERFECT: 0.6,
  // For the 704:480 guide, 32-58% normalized face size allows a larger but bounded composition.
  COMPOSITION_TOO_FAR_ENTER: 0.32,
  COMPOSITION_TOO_FAR_EXIT: 0.36,
  COMPOSITION_TOO_CLOSE_ENTER: 0.58,
  COMPOSITION_TOO_CLOSE_EXIT: 0.54,
  WINDOW_FRAMES: 8,
  WINDOW_MAJORITY: 0.6,
  MIN_HOLD_MS: 800,
  PERFECT_HOLD_MS: 1500,
};

const GUIDE_ASPECT = 704 / 480;
const PRIORITY = ["multiple_faces", "no_face", "too_close", "too_far", "too_left", "too_right", "too_high", "too_low", "tilted", "perfect"];

let sharedFaceWorker = null;
let sharedFaceState = "idle";
let sharedFacePromise = null;
let sharedFaceTimer = 0;
let sharedFaceHandlers = null;
let sharedFaceReject = null;
const sharedFaceSubscribers = new Set();
let sharedFrameSequence = 0;

function notifySharedFaceSubscribers(event) {
  for (const subscriber of Array.from(sharedFaceSubscribers)) {
    try { subscriber(event); } catch (error) { console.error("[SmartScan][FG] subscriber error", error); }
  }
}

function subscribeSharedFaceWorker(subscriber) {
  sharedFaceSubscribers.add(subscriber);
  return function () { sharedFaceSubscribers.delete(subscriber); };
}

function discardSharedFaceWorker(worker) {
  if (!worker || worker !== sharedFaceWorker) return;
  if (sharedFaceTimer) clearTimeout(sharedFaceTimer);
  sharedFaceTimer = 0;
  const handlers = sharedFaceHandlers;
  if (handlers) {
    worker.removeEventListener("message", handlers.message);
    worker.removeEventListener("error", handlers.error);
    worker.removeEventListener("messageerror", handlers.messageerror);
  }
  sharedFaceWorker = null;
  sharedFaceState = "idle";
  sharedFacePromise = null;
  sharedFaceReject = null;
  sharedFaceHandlers = null;
  try { worker.terminate(); } catch (_) {}
}

function failSharedFaceWorker(worker, stage, error) {
  if (!worker || worker !== sharedFaceWorker) return;
  const message = error && error.message ? error.message : String(error || "Error del detector");
  const reject = sharedFaceReject;
  discardSharedFaceWorker(worker);
  notifySharedFaceSubscribers({ data: { type: "error", stage, message } });
  if (reject) {
    const failure = new Error(message);
    failure.stage = stage;
    reject(failure);
  }
}

function ensureSharedFaceWorker() {
  if (sharedFaceWorker && sharedFaceState === "ready") return Promise.resolve(sharedFaceWorker);
  if (sharedFacePromise) return sharedFacePromise;
  if (typeof Worker !== "function") return Promise.reject(new Error("Worker de navegador no disponible"));

  let worker;
  try {
    worker = new Worker(new URL("./face-guidance.worker.js", import.meta.url), { type: "module" });
  } catch (error) {
    return Promise.reject(error);
  }

  sharedFaceWorker = worker;
  sharedFaceState = "loading";
  let resolveReady;
  let rejectReady;
  let settled = false;
  const readiness = new Promise(function (resolve, reject) {
    resolveReady = resolve;
    rejectReady = reject;
  });
  sharedFacePromise = readiness;
  sharedFaceReject = function (error) {
    if (settled) return;
    settled = true;
    rejectReady(error);
  };

  const handlers = {
    message: function (event) {
      if (worker !== sharedFaceWorker) return;
      const data = event.data || {};
      if (data.type === "ready") {
        sharedFaceState = "ready";
        if (sharedFaceTimer) clearTimeout(sharedFaceTimer);
        sharedFaceTimer = 0;
        if (!settled) {
          settled = true;
          resolveReady(worker);
        }
        notifySharedFaceSubscribers(event);
        return;
      }
      if (data.type === "error") {
        failSharedFaceWorker(worker, data.stage || "worker", new Error(data.message || "Error del detector"));
        return;
      }
      if (data.type === "closed") {
        failSharedFaceWorker(worker, "worker_closed", new Error("El worker del detector se cerró"));
        return;
      }
      notifySharedFaceSubscribers(event);
    },
    error: function (event) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      failSharedFaceWorker(worker, "worker", new Error(event && event.message ? event.message : "Error al cargar el worker"));
    },
    messageerror: function () {
      failSharedFaceWorker(worker, "worker_message", new Error("No se pudo leer la respuesta del worker"));
    },
  };
  sharedFaceHandlers = handlers;
  worker.addEventListener("message", handlers.message);
  worker.addEventListener("error", handlers.error);
  worker.addEventListener("messageerror", handlers.messageerror);
  sharedFaceTimer = setTimeout(function () {
    failSharedFaceWorker(worker, "init_timeout", new Error("La inicialización superó 45 segundos"));
  }, 45000);
  try {
    worker.postMessage({ type: "init" });
  } catch (error) {
    failSharedFaceWorker(worker, "worker_start", error);
  }
  return readiness;
}

export function preloadFaceGuidance() {
  return ensureSharedFaceWorker().then(function () { return true; });
}

export function isFaceGuidanceReady() {
  return !!sharedFaceWorker && sharedFaceState === "ready";
}

function createOverlay(mount, video) {
  const box = document.createElement("div");
  box.setAttribute("data-smartscan-face-guidance", "true");
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:30;";

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  const ctx = canvas.getContext("2d", { alpha: true });
  box.appendChild(canvas);

  const label = document.createElement("div");
  label.style.cssText = "position:absolute;z-index:1;left:50%;top:calc(env(safe-area-inset-top, 0px) + 76px);transform:translateX(-50%);box-sizing:border-box;max-width:calc(100% - 24px);padding:8px 12px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(0,0,0,.76);color:#fff;font:600 clamp(12px,3.7vw,14px)/1.35 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.3);";
  label.textContent = MESSAGES.loading;
  box.appendChild(label);
  mount.appendChild(box);

  let cssWidth = 0;
  let cssHeight = 0;
  let pixelRatio = 1;
  let faceVisual = null;
  let guideKey = "loading";
  let lastFaceAt = 0;
  let hideFaceTimer = 0;

  function parsePosition(token, freeSpace) {
    const value = String(token || "50%").toLowerCase();
    if (value === "left" || value === "top") return 0;
    if (value === "right" || value === "bottom") return freeSpace;
    if (value === "center") return freeSpace / 2;
    if (value.endsWith("%")) return freeSpace * (parseFloat(value) || 0) / 100;
    if (value.endsWith("px")) return parseFloat(value) || 0;
    return freeSpace / 2;
  }

  function isMirrored(transform) {
    if (!transform || transform === "none") return false;
    const matrix = transform.match(/^matrix\(([^)]+)\)$/);
    if (matrix) return (parseFloat(matrix[1].split(",")[0]) || 0) < 0;
    const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/);
    if (matrix3d) return (parseFloat(matrix3d[1].split(",")[0]) || 0) < 0;
    return false;
  }

  function mediaLayout(frameWidth, frameHeight) {
    const mountRect = mount.getBoundingClientRect();
    const videoRect = video && video.getBoundingClientRect ? video.getBoundingClientRect() : null;
    const viewWidth = videoRect && videoRect.width > 0 ? videoRect.width : mountRect.width;
    const viewHeight = videoRect && videoRect.height > 0 ? videoRect.height : mountRect.height;
    const viewLeft = videoRect && videoRect.width > 0 ? videoRect.left - mountRect.left : 0;
    const viewTop = videoRect && videoRect.height > 0 ? videoRect.top - mountRect.top : 0;
    if (!frameWidth || !frameHeight || !viewWidth || !viewHeight) return null;

    const style = video ? getComputedStyle(video) : null;
    const fit = style ? style.objectFit : "cover";
    let renderWidth = viewWidth;
    let renderHeight = viewHeight;
    if (fit === "cover" || fit === "contain" || fit === "scale-down" || fit === "none") {
      let scale = fit === "cover"
        ? Math.max(viewWidth / frameWidth, viewHeight / frameHeight)
        : Math.min(viewWidth / frameWidth, viewHeight / frameHeight);
      if (fit === "scale-down") scale = Math.min(1, scale);
      if (fit === "none") scale = 1;
      renderWidth = frameWidth * scale;
      renderHeight = frameHeight * scale;
    }

    const position = style ? style.objectPosition.trim().split(/\s+/) : ["50%", "50%"];
    const offsetX = parsePosition(position[0], viewWidth - renderWidth);
    const offsetY = parsePosition(position[1] || position[0], viewHeight - renderHeight);
    const mirrored = style ? isMirrored(style.transform) : false;
    const contentLeft = viewLeft + (mirrored ? viewWidth - offsetX - renderWidth : offsetX);
    const contentTop = viewTop + offsetY;

    return {
      left: viewLeft,
      top: viewTop,
      width: viewWidth,
      height: viewHeight,
      contentLeft,
      contentTop,
      contentWidth: renderWidth,
      contentHeight: renderHeight,
      scaleX: renderWidth / frameWidth,
      scaleY: renderHeight / frameHeight,
      mirrored,
    };
  }

  function getCompositionTarget(frameWidth, frameHeight) {
    const layout = mediaLayout(frameWidth, frameHeight);
    if (!layout || layout.contentWidth <= 0 || layout.contentHeight <= 0) return null;
    const guideWidth = Math.max(0, Math.min(layout.contentWidth * 0.82, 360, layout.contentHeight * 0.74 * GUIDE_ASPECT));
    const guideHeight = guideWidth / GUIDE_ASPECT;
    if (guideWidth <= 0 || guideHeight <= 0) return null;
    return {
      left: (layout.contentWidth - guideWidth) / (2 * layout.contentWidth),
      top: (layout.contentHeight - guideHeight) / (2 * layout.contentHeight),
      width: guideWidth / layout.contentWidth,
      height: guideHeight / layout.contentHeight,
    };
  }

  function resizeCanvas() {
    const rect = mount.getBoundingClientRect();
    const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = rect.width;
    cssHeight = rect.height;
    pixelRatio = nextRatio;
    canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (ctx) ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    draw();
  }

  function draw() {
    if (!ctx || !cssWidth || !cssHeight) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const sourceWidth = faceVisual && faceVisual.frameWidth || (video && video.videoWidth);
    const sourceHeight = faceVisual && faceVisual.frameHeight || (video && video.videoHeight);
    const layout = mediaLayout(sourceWidth, sourceHeight);
    if (!layout) return;

    const guideWidth = Math.max(0, Math.min(layout.contentWidth * 0.82, 360, layout.contentHeight * 0.74 * GUIDE_ASPECT));
    const guideHeight = guideWidth / GUIDE_ASPECT;
    const guideX = layout.contentLeft + (layout.contentWidth - guideWidth) / 2;
    const guideY = layout.contentTop + (layout.contentHeight - guideHeight) / 2;
    const noFace = guideKey === "no_face";
    const unavailable = guideKey === "unavailable";
    const aligned = guideKey === "perfect";
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = aligned ? "#22c55e" : noFace ? "#fb7185" : unavailable ? "rgba(245,240,232,.7)" : "#D8B77A";
    ctx.setLineDash(aligned ? [] : [8, 7]);
    ctx.shadowColor = "rgba(0,0,0,.72)";
    ctx.shadowBlur = 4;
    ctx.strokeRect(guideX, guideY, guideWidth, guideHeight);
    ctx.restore();

    if (!faceVisual || !faceVisual.box || !faceVisual.frameWidth || !faceVisual.frameHeight) return;
    const age = Math.max(0, performance.now() - lastFaceAt);
    if (age > 190) return;
    const opacity = Math.max(0.3, 1 - age / 260);
    const sourceBox = faceVisual.box;
    const sourceX1 = sourceBox.x;
    const sourceX2 = sourceBox.x + sourceBox.width;
    const mapX = function (sourceX) {
      return layout.contentLeft + (layout.mirrored
        ? layout.contentWidth - sourceX * layout.scaleX
        : sourceX * layout.scaleX);
    };
    const screenX1 = mapX(sourceX1);
    const screenX2 = mapX(sourceX2);
    const screenY = layout.contentTop + sourceBox.y * layout.scaleY;
    const boxX = Math.min(screenX1, screenX2);
    const boxY = screenY;
    const boxWidth = Math.abs(screenX2 - screenX1);
    const boxHeight = sourceBox.height * layout.scaleY;
    if (boxWidth <= 0 || boxHeight <= 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#5EEAD4";
    ctx.shadowColor = "rgba(0,0,0,.65)";
    ctx.shadowBlur = 3;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.shadowBlur = 0;
    for (const point of faceVisual.keypoints) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
      const pointX = layout.contentLeft + (layout.mirrored ? layout.contentWidth - point.x * layout.scaleX * faceVisual.frameWidth : point.x * layout.scaleX * faceVisual.frameWidth);
      const pointY = layout.contentTop + point.y * layout.scaleY * faceVisual.frameHeight;
      ctx.beginPath();
      ctx.arc(pointX, pointY, 2.7, 0, Math.PI * 2);
      ctx.fillStyle = "#D8B77A";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(15,23,42,.9)";
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateVisual(geo, frameWidth, frameHeight, key, now) {
    guideKey = key || "no_face";
    const detected = geo && geo.face && frameWidth > 0 && frameHeight > 0;
    if (detected) {
      if (hideFaceTimer) clearTimeout(hideFaceTimer);
      hideFaceTimer = 0;
      const next = {
        frameWidth,
        frameHeight,
        box: geo.face.box,
        keypoints: geo.face.keypoints,
      };
      if (faceVisual && faceVisual.frameWidth === frameWidth && faceVisual.frameHeight === frameHeight) {
        const blend = function (oldValue, newValue) { return oldValue * 0.4 + newValue * 0.6; };
        next.box = {
          x: blend(faceVisual.box.x, next.box.x),
          y: blend(faceVisual.box.y, next.box.y),
          width: blend(faceVisual.box.width, next.box.width),
          height: blend(faceVisual.box.height, next.box.height),
        };
        if (faceVisual.keypoints.length === next.keypoints.length) {
          next.keypoints = next.keypoints.map(function (point, index) {
            const previous = faceVisual.keypoints[index];
            return previous && point && Number.isFinite(previous.x) && Number.isFinite(previous.y)
              ? { x: blend(previous.x, point.x), y: blend(previous.y, point.y) }
              : point;
          });
        }
      }
      faceVisual = next;
      lastFaceAt = now;
    } else if (guideKey === "unavailable" || guideKey === "loading") {
      if (hideFaceTimer) clearTimeout(hideFaceTimer);
      hideFaceTimer = 0;
      faceVisual = null;
    } else if (faceVisual && !hideFaceTimer) {
      hideFaceTimer = setTimeout(function () {
        hideFaceTimer = 0;
        faceVisual = null;
        draw();
      }, 170);
    }
    draw();
  }

  function paint(key) {
    label.textContent = MESSAGES[key] || MESSAGES.unavailable;
    label.style.opacity = key === "unavailable" ? "0.78" : "1";
    label.style.fontWeight = key === "unavailable" ? "500" : "600";
    label.style.borderColor = key === "perfect" ? "rgba(34,197,94,.8)" :
      key === "unavailable" || key === "multiple_faces" || key === "no_face" ? "rgba(239,68,68,.8)" :
        key === "loading" ? "rgba(255,255,255,.2)" : "rgba(216,183,122,.85)";
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resizeCanvas) : null;
  if (observer) observer.observe(mount);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  if (video) video.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  return {
    paint,
    updateVisual,
    getCompositionTarget,
    getMediaLayout: mediaLayout,
    dispose: function () {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      if (video) video.removeEventListener("resize", resizeCanvas);
      if (hideFaceTimer) clearTimeout(hideFaceTimer);
    },
  };
}

function analyzeDetections(detections, width, height) {
  const out = { count: detections.length, valid: false, score: null, cx: null, dx: null, area: null, roll: null, rollUsable: false, kpCount: 0, face: null, frameWidth: width, frameHeight: height };
  if (!detections.length || !width || !height) return out;

  let primary = null;
  let largest = -1;
  for (const detection of detections) {
    const box = detection && detection.boundingBox;
    if (!box) continue;
    const area = Math.max(0, box.width) * Math.max(0, box.height);
    if (area > largest) { largest = area; primary = detection; }
  }
  if (!primary || !primary.boundingBox) return out;

  const box = primary.boundingBox;
  out.area = (box.width * box.height) / (width * height);
  out.cx = (box.originX + box.width / 2) / width;
  out.dx = out.cx - CONFIG.TARGET_CENTER_X;
  const categories = primary.categories || [];
  out.score = categories.length ? categories[0].score : null;
  const points = primary.keypoints || [];
  out.kpCount = points.length;
  if ([box.originX, box.originY, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0) {
    out.face = {
      box: { x: box.originX, y: box.originY, width: box.width, height: box.height },
      keypoints: points,
    };
  }
  if (points.length >= 2) {
    const a = points[0], b = points[1];
    if (a && b && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      const left = a.x <= b.x ? a : b;
      const right = a.x <= b.x ? b : a;
      const dx = right.x - left.x;
      if (Math.abs(dx) > 1e-6) {
        out.roll = Math.atan2(right.y - left.y, dx) * 180 / Math.PI;
        out.rollUsable = true;
      }
    }
  }
  out.valid = Number.isFinite(out.area) && out.area > 0 && Number.isFinite(out.cx);
  return out;
}

function classifySigned(value, enter, exit, current) {
  if (current === "neg") return value > -exit ? 0 : -1;
  if (current === "pos") return value < exit ? 0 : 1;
  if (value < -enter) return -1;
  if (value > enter) return 1;
  return 0;
}

function classifyRange(value, minEnter, minExit, maxEnter, maxExit, current) {
  if (current === "low") return value > minExit ? 0 : -1;
  if (current === "high") return value < maxExit ? 0 : 1;
  if (value < minEnter) return -1;
  if (value > maxEnter) return 1;
  return 0;
}

function classifyAbs(value, enter, exit, current) {
  const magnitude = Math.abs(value);
  if (current === "on") return magnitude < exit ? 0 : -1;
  return magnitude > enter ? -1 : 0;
}

function evaluateGuidance(geo, current, composition) {
  if (!geo || geo.count === 0) return "no_face";
  if (geo.count > 1) return "multiple_faces";
  if (!geo.valid) return "no_face";

  let horizontal = 0;
  let vertical = 0;
  let tooClose = false;
  let tooFar = false;
  const hasComposition = composition && geo.face && geo.frameWidth > 0 && geo.frameHeight > 0;
  if (hasComposition) {
    const box = geo.face.box;
    const centerX = (box.x + box.width / 2) / geo.frameWidth;
    const centerY = (box.y + box.height / 2) / geo.frameHeight;
    // BlazeFace detects the face only; the remaining guide area is a composition margin, not shoulder detection.
    const relativeWidth = (box.width / geo.frameWidth) / composition.width;
    const relativeHeight = (box.height / geo.frameHeight) / composition.height;
    const horizontalOffset = (centerX - (composition.left + composition.width / 2)) / composition.width;
    const verticalOffset = (centerY - (composition.top + composition.height * CONFIG.COMPOSITION_CENTER_Y)) / composition.height;
    horizontal = classifySigned(horizontalOffset, 0.10, 0.06,
      current === "too_left" ? "neg" : current === "too_right" ? "pos" : null);
    vertical = classifySigned(verticalOffset, 0.09, 0.06,
      current === "too_high" ? "neg" : current === "too_low" ? "pos" : null);
    tooClose = current === "too_close"
      ? relativeWidth > CONFIG.COMPOSITION_TOO_CLOSE_EXIT || relativeHeight > CONFIG.COMPOSITION_TOO_CLOSE_EXIT
      : relativeWidth > CONFIG.COMPOSITION_TOO_CLOSE_ENTER || relativeHeight > CONFIG.COMPOSITION_TOO_CLOSE_ENTER;
    tooFar = current === "too_far"
      ? relativeWidth < CONFIG.COMPOSITION_TOO_FAR_EXIT && relativeHeight < CONFIG.COMPOSITION_TOO_FAR_EXIT
      : relativeWidth < CONFIG.COMPOSITION_TOO_FAR_ENTER && relativeHeight < CONFIG.COMPOSITION_TOO_FAR_ENTER;
  } else {
    horizontal = classifySigned(geo.dx, CONFIG.CENTER_ENTER_X, CONFIG.CENTER_EXIT_X,
      current === "too_left" ? "neg" : current === "too_right" ? "pos" : null);
    const area = classifyRange(geo.area, CONFIG.AREA_MIN_ENTER, CONFIG.AREA_MIN_EXIT,
      CONFIG.AREA_MAX_ENTER, CONFIG.AREA_MAX_EXIT,
      current === "too_far" ? "low" : current === "too_close" ? "high" : null);
    tooClose = area === 1;
    tooFar = area === -1;
  }
  const roll = geo.rollUsable
    ? classifyAbs(geo.roll, CONFIG.ROLL_ENTER_DEG, CONFIG.ROLL_EXIT_DEG, current === "tilted" ? "on" : null)
    : 0;

  const flags = {
    too_close: tooClose,
    too_far: tooFar,
    too_left: horizontal === -1,
    too_right: horizontal === 1,
    too_high: vertical === -1,
    too_low: vertical === 1,
    tilted: roll === -1,
  };
  for (const key of PRIORITY) if (key !== "perfect" && flags[key]) return key;

  if (hasComposition && geo.score !== null && geo.score >= CONFIG.MIN_SCORE_PERFECT && geo.rollUsable && geo.kpCount >= 2) return "perfect";
  if (!tooClose && !tooFar && horizontal === 0 && vertical === 0 && roll === 0) return "steady";
  return "steady";
}
function dominantOf(items) {
  if (!items.length) return null;
  const counts = Object.create(null);
  for (const key of items) counts[key] = (counts[key] || 0) + 1;
  let best = null, count = 0;
  for (const key of Object.keys(counts)) if (counts[key] > count) { best = key; count = counts[key]; }
  return count >= Math.ceil(items.length * CONFIG.WINDOW_MAJORITY) ? best : null;
}

export function startFaceGuidance(video, mount) {
  const overlay = createOverlay(mount, video);
  const paint = overlay.paint;
  let stopped = false;
  let failed = false;
  let ready = false;
  let busy = false;
  let worker = null;
  let unsubscribeWorker = null;
  let rafId = 0;
  let frameTimer = 0;
  let lastVideoTime = -1;
  let lastInferAt = 0;
  let lastTimestamp = -1;
  let lastSubmittedId = 0;
  let displayed = "no_face";
  let windowKeys = Array(CONFIG.WINDOW_FRAMES).fill("no_face");
  let pendingKey = null;
  let pendingSince = 0;
  let resizeSupported = true;

  function cancelWork() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (frameTimer) clearTimeout(frameTimer);
    frameTimer = 0;
  }

  function terminateWorker() {
    if (unsubscribeWorker) { unsubscribeWorker(); unsubscribeWorker = null; }
    if (worker) { discardSharedFaceWorker(worker); worker = null; }
  }

  function fail(stage, error) {
    if (stopped || failed) return;
    failed = true;
    ready = false;
    busy = false;
    cancelWork();
    terminateWorker();
    const message = error && error.message ? error.message : String(error || "Error desconocido");
    console.error("[SmartScan][FG] fallo en etapa: " + stage + " " + message);
    paint("unavailable");
    overlay.updateVisual(null, 0, 0, "unavailable", performance.now());
  }

  function markReady() {
    if (stopped || failed || ready) return;
    ready = true;
    displayed = "no_face";
    windowKeys = Array(CONFIG.WINDOW_FRAMES).fill("no_face");
    paint(displayed);
    overlay.updateVisual(null, video.videoWidth, video.videoHeight, displayed, performance.now());
    rafId = requestAnimationFrame(tick);
  }

  function stabilize(raw, now) {
    if (!raw) return;
    windowKeys.push(raw);
    if (windowKeys.length > CONFIG.WINDOW_FRAMES) windowKeys.shift();
    const dominant = dominantOf(windowKeys);
    if (!dominant) return;
    if (dominant === displayed) { pendingKey = null; return; }
    if (dominant !== pendingKey) { pendingKey = dominant; pendingSince = now; return; }
    const hold = dominant === "perfect" ? CONFIG.PERFECT_HOLD_MS : CONFIG.MIN_HOLD_MS;
    if (now - pendingSince >= hold) {
      displayed = dominant;
      pendingKey = null;
      paint(displayed);
    }
  }

  function sendFrame(now) {
    if (typeof createImageBitmap !== "function") {
      fail("frame", new Error("createImageBitmap no está disponible"));
      return;
    }
    busy = true;
    lastInferAt = now;
    lastVideoTime = video.currentTime;
    const id = ++sharedFrameSequence;
    lastSubmittedId = id;
    const timestampMs = Math.max(now, lastTimestamp + 1);
    lastTimestamp = timestampMs;

    const maxDimension = 640;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    let bitmapPromise;
    if (resizeSupported && scale < 1) {
      const options = {
        resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(video.videoHeight * scale)),
        resizeQuality: "low",
      };
      bitmapPromise = createImageBitmap(video, options).catch(function () {
        resizeSupported = false;
        return createImageBitmap(video);
      });
    } else {
      bitmapPromise = createImageBitmap(video);
    }

    bitmapPromise.then(function (bitmap) {
      if (stopped || failed || !worker) { bitmap.close(); busy = false; return; }
      try {
        worker.postMessage({ type: "frame", id, timestampMs, bitmap }, [bitmap]);
        frameTimer = setTimeout(function () {
          fail("detect_timeout", new Error("Sin respuesta de detección"));
        }, 15000);
      } catch (error) {
        try { bitmap.close(); } catch (_) {}
        fail("frame_transfer", error);
      }
    }).catch(function (error) {
      fail("frame", error);
    });
  }

  function tick(now) {
    if (stopped || failed) return;
    rafId = requestAnimationFrame(tick);
    if (!ready || busy || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    if (now - lastInferAt < CONFIG.INFER_INTERVAL_MS || video.currentTime === lastVideoTime) return;
    sendFrame(now);
  }

  function onMessage(event) {
    const data = event.data || {};
    if (data.type === "closed") {
      fail("worker_closed", new Error("El worker del detector se cerró"));
      return;
    }
    if (stopped || failed) return;
    if (data.type === "ready") {
      markReady();
      return;
    }
    if (data.type === "error") {
      fail(data.stage || "worker", new Error(data.message || "Error del detector"));
      return;
    }
    if (data.type === "result") {
      if (data.id !== lastSubmittedId) return;
      if (frameTimer) clearTimeout(frameTimer);
      frameTimer = 0;
      busy = false;
      const geo = analyzeDetections(data.detections || [], data.width, data.height);
      const composition = overlay.getCompositionTarget(data.width, data.height);
      const raw = evaluateGuidance(geo, displayed, composition);
      const now = performance.now();
      stabilize(raw, now);
      overlay.updateVisual(geo, data.width, data.height, displayed, now);
    }
  }

  try {
    if (!video || !mount || typeof Worker !== "function") throw new Error("Worker de navegador no disponible");
    unsubscribeWorker = subscribeSharedFaceWorker(onMessage);
    ensureSharedFaceWorker().then(function (currentWorker) {
      if (stopped || failed) return;
      worker = currentWorker;
      markReady();
    }).catch(function (error) {
      if (!stopped && !failed) fail(error && error.stage || "worker_start", error);
    });
  } catch (error) {
    fail("worker_start", error);
  }

  return {
    getCompositionTarget: overlay.getCompositionTarget,
    getMediaLayout: overlay.getMediaLayout,
    stop: function () {
      if (stopped) return;
      stopped = true;
      cancelWork();
      busy = false;
      if (unsubscribeWorker) { unsubscribeWorker(); unsubscribeWorker = null; }
      worker = null;
      overlay.dispose();
      while (mount.firstChild) mount.removeChild(mount.firstChild);
    },
  };
}
