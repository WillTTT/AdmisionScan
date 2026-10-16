# AGENTS.md

## Qué es este repo

Copia limpia e independiente de una SPA **pre-compilada** (el proyecto original se descargó desde Netlify) alojada en `D:\AdmisionUnsaac\AdmisionScan`, preparada para un repositorio **privado** de GitHub y su publicación en Cloudflare Pages. **No hay `src/`, ni build, ni tests, ni lint, ni typecheck.** Toda la app React vive en un único bundle minificado.

- App: `assets/index-CVsQaZ5q.js` (**2.520.377 B, 5.804 líneas, sin sourcemap**; reformateado con espacios; SHA256 `D6C76341401ACEC31999ACBABDA768EE0E6D634533B2A3886DB0D7A9E8EEDBE2`)
- HTML: `index.html` (CDN: Tailwind, OpenCV.js 4.8.0 **async** desde docs.opencv.org, importmap aistudiocdn; splash `MIN_VISIBLE_MS = 3000`)
- Deploy previsto: estático en **Cloudflare Pages** con fallback SPA vía `_redirects` (aún **sin publicar**). Aquí no existe `netlify.toml` (sí en el proyecto original).
- No existe `opencode.json`/`CLAUDE.md`. `README.md` está en UTF-8 y documenta servir en :8080, el estado real de Git y el flujo PR una vez exista remoto. Ante conflicto README vs config real, confía en lo ejecutable.

## Estado que debe conservarse

- Proyecto en `D:\AdmisionUnsaac\AdmisionScan` (copia independiente, sin historial Git heredado).
- Rama inicial `main`; **0 commits y sin remoto** hasta nueva autorización; publicación en GitHub (privado) y Cloudflare Pages **pendiente**.
- Splash con duración mínima de **3000 ms** (`index.html:216` `MIN_VISIBLE_MS = 3000`).
- Texto del botón de eliminación de fondo: **`Quitar Fondo`** (sin sufijo "(IA Local)"; se acepta la mayúscula).
- Mejoras de interfaz para pantallas grandes: reservadas para una versión posterior.

## Comandos (ojo con los puertos y PowerShell)

- Servir en **:8080**: `cmd /c "npx serve -l 8080 ."` (verificado localmente: responde 200 y sirve el bundle; no existe `iniciar_proyecto.bat` en esta copia)
- `npm start` / `npm run dev` = `npx serve .` **sin** `-l` → sirve en **:3000** (verificado localmente: responde 200)
- **PowerShell tiene ExecutionPolicy que bloquea `npm`/`npx` (resuelven a `.ps1`)** → fallan con `PSSecurityException`. Usar `cmd /c "npx ..."` o `npx.cmd`. `node.exe` directo funciona siempre.
- Única verificación de sintaxis disponible: `node --check assets/index-CVsQaZ5q.js` → exit 0
- No existen tests/lint/typecheck/build: `npm run build` no existe. No inventes comandos.

## Editar la app = editar el bundle

No hay código fuente. Cualquier cambio de funcionalidad se hace con **reemplazos de strings quirúrgicos** sobre `assets/index-CVsQaZ5q.js`:

1. **Antes**: SHA256 del bundle actual (ver "Qué es este repo"); si el cambio es sensible, crear antes una **copia de seguridad verificable** (SHA256 antes/después) en una carpeta fuera del repo — los backups históricos no están en esta copia. `git status` para el estado real (esta copia arrancó con todo staged y 0 commits; lo editado sin re-agregar aparece como "modified").
2. **Bytes, no UTF-8**: el bundle contiene mojibake (bytes UTF-8 inválidos). Leer como `Buffer` (`fs.readFileSync` sin encoding) y reemplazar con `Buffer.concat` o `latin1`. **NUNCA** `readFileSync(...,'utf8')` + `writeFileSync`: los bytes inválidos se reemplazan por U+FFFD y rompes la identidad byte a byte (verificaciones de backup/segmentos dejan de cuadrar).
3. **Patrones**: exactamente 1 coincidencia antes de reemplazar (0 o >1 → STOP). Usa `indexOf`/concatenación con strings normales; **nunca template literals gigantes** (un intento anterior falló con SyntaxError por escapado).
4. **PowerShell + `node -e`**: las comillas escapadas se rompen al pasar por el shell. Escribir JS con comillas simples y `String.fromCharCode(34)` para `"` (o script temporal fuera del repo, borrarlo tras usarlo — siempre).
5. **Después**: SHA256 nuevo, tamaño, `node --check`, y los checks negativos de la sección siguiente.
6. Prefiere fallar con STOP sobre "reparar" a ciegas.

### Trampas de unicidad de patrones (verificado)

- `validateGeometry` existe **2 veces con cuerpo casi idéntico** (una por componente): DocumentCropper (**PROTEGIDO**, gate de área `A < .15 || A > .9`, count=1, idx char ~1993203) y Scanner (tras el fix, `A < .03 || A > .9`, count=1, idx char ~2469561, dentro del componente que arranca en `Scanner = (` en idx 2467549). Los demás gates dan **2 hits** (uno por función), todos verificados con count=2: `p.x < .02 || p.x > .98`, `deg < 60 || deg > 120`, `Math.min(d1, d2) / Math.max(d1, d2) < .85`, `ar < 1.25 || ar > 1.8`. Nunca hagas `replaceAll` de ningún gate: confirma el contexto de la función y haz una sola sustitución. Los índices byte de los textos antiguos pertenecían al snapshot original pre-reformateo: recalcula siempre con `indexOf` sobre el archivo actual.
- `COLOR_RGBA2GRAY` y `window.cv` también aparecen en ambos componentes.
- La línea 3 del bundle es un comentario de licencia de React que contiene `react-jsx-runtime` — los conteos de identificadores "desnudos" (`jsx` sin punto) pueden matchear ahí: es inerte.

### Backups históricos (no están en esta copia)

- Los snapshots `index-CVsQaZ5q_BACKUP_CALIDAD.js` (SHA256 `7D4EAB0D…74345`), `_PRE_SCROLLFIX`, `_PRE_QUADSCAN`, `_PRE_INITIALCORNERS`, `_PRE_ROTATION` y el script fallido `implement_live.js` permanecen en el proyecto original (`D:\AdmisionUnsaac\SCAN-INTELIGENTE-LIMPIO`); **no existen aquí** y no deben copiarse a esta copia. Jamás modificarlos allí.
- Si esta copia recibe un cambio sensible al bundle, crear antes una copia de seguridad nueva y verificable (SHA256) en una carpeta fuera del repo y no tocarla después.

### Componentes protegidos (no tocar salvo autorización explícita)

Dentro del bundle, estos deben permanecer byte-idénticos; verifícalos extrayendo su segmento antes/después:

- `Ng()` en Scanner — captura final (resolución 3000px, JPEG .98, salto a `crop_a4`)
- `DocumentCropper` (idx histórico ~1775675 — recalcula con `indexOf`) — pipeline OpenCV post-captura
- `PhotoEditor` / rama `photo_id` — editor de foto intacto
- PDF/jsPDF (`PDFPreview`), StorageService, `index.html`

Método de verificación: el prefijo del bundle **antes de `Scanner = ({ mode: e, onCancel: t, onScanComplete: r }) => {`** (patrón único verificado; en el snapshot original era `Scanner=({mode:e,...}){`) debe ser idéntico byte a byte (cubre DocumentCropper + PDF); más comparación de segmentos ancla de `Ng()` y de la guía `photo_id`.

## Mapa del bundle (posiciones HISTÓRICAS — no utilizable sin recalcular)

- Estos offsets corresponden al snapshot original **pre-reformateo**: `PhotoEditor=` ~1768201 · `DocumentCropper=` ~1775675 · `PDFPreview=` ~2166534 · `Scanner=` ~2171140 · `Dashboard=` ~2193660 · `PhotoRecommendations=` ~2208036. En el bundle actual (2.520.377 B) están desplazados: **recalcula siempre con `indexOf`** (p. ej. `Scanner = (` está ahora en idx 2467549).

Quirks de nombres (minificado, no deducibles por nombre):

- En `Scanner = ({ mode: e, onCancel: t, onScanComplete: r }) => {` (idx char 2467549) **la variable del modo es `e`** (no `mode`). Refs: `Se`=video, `Te`=stream, `Ie`=input archivo; `jg()`=cleanup, `zo()`=init cámara, `Ng()`=captura.
- `DocumentCropper` define su propio `validateGeometry` y un orden de esquinas por `min(x+y)`; definir otro `validateGeometry` dentro de `Scanner` es legal (ámbitos separados), pero no modificar el de DocumentCropper.
- Live detector (sesión 2026-10): `orderCornersCyclic` (centroide+atan2, **sin** TL semántico), `setInterval(tick,180)` con `isBusyRef`/`mountedRef`, refs vía `reactExports.useRef` — conserva estas decisiones.
- **Rotación manual (2026-10)**: `DocumentCropper` ahora tiene estado `rotation` (0-3 = 0°/90°/180°/270° CW) con helpers `rotPt`, `invRotPt`, `rotateOut`. Las esquinas `je` se mantienen en coordenadas originales; la rotación es solo display + salida. Iconos `RotateCw`/`RotateCcw` añadidos como `createLucideIcon`.

## ESTADO DEL LIVE DETECTOR (original: 2026-10-07 — el estado actual de esta copia está más abajo, en "Estado actual del live detector")

### Fix del error runtime `jsx` — APLICADO Y VERIFICADO (histórico)

- Estado tras ese fix en el proyecto original (2.210.657 bytes): `C0E0E0AC2FFB5B69C2B7B7862C6C2536EE145B2153D80FC5E2605CBDDC5B91B7`. El bundle actual de esta copia es distinto (SHA en "Qué es este repo") porque incluye las ediciones posteriores de todas las sesiones, más el reformateo.
- El error runtime `jsx is not defined` (pantalla en blanco tras pulsar "Entendido") fue localizado y corregido.
- La corrección fue: `jsx("canvas"...` → `jsxRuntimeExports.jsx("canvas"...` (único `jsx` desnudo ejecutable del bundle, en el overlay del live detector de Scanner).
- `node --check` pasa (exit 0).
- La cámara ahora aparece correctamente en pruebas reales.
- SHA de transición del fix anterior: `49C46715605B49A3C4BF6D837AC8D897634BF5031CE383FD7E1F462F6C9C8759` → `C0E0E0AC2FFB5B69C2B7B7862C6C2536EE145B2153D80FC5E2605CBDDC5B91B7`.
- **BACKUP protegido** (no modificar; vive en el proyecto original, ver "Backups históricos"): `7D4EAB0DD3E41D513C9CE8C3F8C9D867BE89AA57DFD8C888502476B354474345`

### Prueba real (histórico: iPhone mediante Cloudflare HTTPS)

- Scanner funciona; cámara funciona.
- DNI: permanece **rojo** incluso correctamente colocado.
- A4: permanece **rojo** incluso correctamente colocado.
- No se observa **ningún polígono** de detección (overlay limpio en todo momento).

### OpenCV — CARGADO CORRECTAMENTE (etapa 0 descartada)

- `typeof window.cv` → `object`
- `window.cv && window.cv.Mat` → `function Mat()`
- Por tanto OpenCV está cargado correctamente: el problema **NO** es la carga de OpenCV. (Siguen en pie las advertencias generales: el tick sale antes de detectar si cv no cargó, `liveState` no se renderiza en ningún sitio y el `catch` del tick no loguea ⇒ cualquier fallo de cv sería invisible; pero ya está descartado en dispositivo.)

### Estado actual del live detector (esta copia)

- **FIX APLICADO** (ya no hay nada "aprobado sin ejecutar"): los umbrales actuales son `minArea = tw * th * .01` (count=1, dentro del pipeline de contornos de `detectLiveCorners`, tras `morphologyEx`/`findContours`) y `A < .03` (count=1, en el `validateGeometry` de Scanner, idx char ~2469561 dentro del componente que inicia en 2467549). El `A < .15` restante (count=1, idx char ~1993203) es el del `validateGeometry` **PROTEGIDO** de DocumentCropper.
- Contexto histórico que motivó el fix: canvas de análisis de **320 px** sobre el frame completo (`drawImage(video,0,0,tw,th)`) y `object-fit: cover` hacían que el documento ocupara ~10,8 % (A4) / ~5,5 % (DNI) de área; los umbrales previos (`minArea = tw * th * .05`, `A < .15`) descartaban candidatos **antes** de llegar a `validateLiveAlignment()`.

**NO modificar**: DocumentCropper · `Ng()` · PhotoEditor/`photo_id` · PDF/jsPDF · StorageService · `index.html` · `validateLiveAlignment()` · `orderCornersCyclic()` · `computeCandidateScore()` · cualquier otro umbral.

Si se toca un umbral de nuevo: verifica unicidad sobre el archivo actual (count=1), ejecuta `node --check` después y comprueba los conteos esperados (`A < .15`=1, `A < .03`=1, `minArea = tw * th * .01`=1).

### Triage de errores (lección)

- Los errores de Chrome en minificado pueden apuntar a columnas de **bytes cacheados distintos** a los actuales (un trace decía col 18947 y V8 sobre el archivo actual daba 19061): confirmar posiciones siempre con `node` sobre el archivo actual, no con la consola del navegador.

## Hechos fáciles de pasar por alto

- **No hay IA funcional remota**: el importmap incluye `@google/genai` pero está **sin usar** (0 llamadas). La "IA" real es local: OpenCV.js (CDN, `window.cv`) + `@imgly/background-removal`.
- El bundle contiene **strings con mojibake** (`cǭmara`, `Frente` con bytes corruptos) — son artefactos de encoding del original. No los "arregles": romperían verificaciones byte a byte y no afectan funcionalidad.
- OpenCV se carga **async desde CDN**: todo código que usa `window.cv` debe comprobar `window.cv && window.cv.Mat` y tolerar que aún no cargó. Cada `cv.Mat` creado debe `.delete()` en `finally`.
- Solo los dos primeros modos de Scanner (`dni_card`, `document_a4`) usan live detector; `photo_id` no debe alterarse.
- Git en ESTA copia: `git init` hecho, rama `main`, **0 commits, sin remoto configurado**; los archivos base estaban staged y la documentación editada queda como "modified" sin re-agregar. El repo privado de GitHub y el despliegue en Cloudflare Pages están **pendientes**. README documenta el flujo PR para cuando exista remoto (pull → rama feature → commit `feat:` → PR). **No hagas commit, push, reset, clean ni despliegues sin autorización explícita.**

## ESTADO ROTACIÓN MANUAL — 2026-10-12

### Implementación completada

- Estado tras la rotación en el proyecto original (2.216.178 bytes): `CAB5703527B529D36C2E08A7A6D45BFFA310EC51AE916AEF9209128D1A7F0E1C`; backup `PRE_ROTATION` `5E1A4102805F06DFE7861641FA3C4946FBCA0A6F1932B389493E7AA99A447125` (allí, no en esta copia).
- En esta copia la rotación está presente: `rotPt` (×4), `invRotPt` (×2), `rotateOut` (×4) verificados en el bundle actual; `node --check` → exit 0. (Registro histórico de la sesión original: 12 ediciones quirúrgicas con count=1 y 41/41 pruebas de harness — no re-ejecutado aquí.)

### Qué se implementó

- Estado `[rotation,setRotation]` (0-3) en `DocumentCropper`
- Helpers: `rotPt` (original→display), `invRotPt` (display→original), `rotateOut` (rota canvas de salida)
- Draw effect: aspect ratio rotado, imagen dibujada con `ctx.rotate`, esquinas mapeadas con `rotPt`
- Magnifier (lupa): posición con `rotPt`, contenido con `ctx.rotate` (anidado save/restore)
- Hit-test (`Bo`): aspect rotado + `rotPt` para mapeo de esquinas
- Drag (`Mo`): aspect rotado + `invRotPt` para convertir posición puntero→coord original
- Confirmar (`Og`): `rotateOut(canvas, rotation)` antes de `toDataURL` en warp Y fallback
- UI: 3 botones en barra inferior (RotateCcw, RotateCw, "0°") antes de "Confirmar Recorte"
- Iconos: `RotateCw`/`RotateCcw` añadidos con `createLucideIcon` (no existían en bundle)

### Invariantes verificados

- `je` siempre en coordenadas originales (0-1 sobre imagen original)
- `initialCorners` intactos (sin rotación aplicada)
- `warpPerspective` usa coords originales × `Te.width/height`
- Rotation=0 → idéntico al comportamiento previo (sin regresión)
- Calidad JPEG .98/.9 y resolución sin cambios
- Protegidos byte-idénticos: PhotoEditor, PDFPreview, Scanner, StorageService, Ng(), initialCorners transfer

### Validación en dispositivos físicos (estado)

Reportado en sesiones previas (no re-ejecutado en esta actualización): flujos generales probados en laptop y celular vía túnel temporal (Cloudflare Tunnel). Sigue **pendiente** en dispositivos físicos concretos:

- iPhone Safari: rotación visual, drag tras girar, PDF con orientación correcta
- Android Chrome: ídem
- DNI anverso+reverso con rotaciones distintas → `Ig` combina correctamente
- Fallback OpenCV (sin cv) con rotación aplicada
