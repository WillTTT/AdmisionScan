# AdmisiónScan (UNSAAC)

Aplicación web estática (SPA React precompilada) para el escaneo asistido y el procesamiento digital de documentos —DNI, hojas A4 y fotografías— usados en el proceso de admisión de la UNSAAC. Todo el procesamiento ocurre en el navegador: no hay backend, ni base de datos, ni subida de archivos a un servidor propio.

> **Estado actual:** copia limpia e independiente alojada en `D:\AdmisionUnsaac\AdmisionScan`, preparada para un repositorio **privado** de GitHub y su publicación posterior en **Cloudflare Pages**. **Todavía no está publicada en GitHub ni en Cloudflare Pages**, no tiene commits y no tiene remoto configurado.

## Qué hace la aplicación

- Escaneo de **DNI** (anverso/reverso) y de **documentos A4** con asistencia visual (guía en pantalla), detección de bordes y alineación de perspectiva.
- Captura **fotográfica** con guía facial y recomendaciones para trámites.
- Etapa de **recorte** con esquinas ajustables y **rotación manual** (0°/90°/180°/270°).
- Editor de foto (zoom, quitar fondo, descarga) y generación de **PDF** para descarga.

## Tecnologías y dependencias reales

Declaradas en `index.html` y efectivamente usadas en tiempo de ejecución (se cargan desde la red al abrir la app):

| Componente | Origen | Para qué |
|---|---|---|
| React 19 / ReactDOM | `aistudiocdn.com` (importmap) | Framework de interfaz |
| Tailwind CSS | `cdn.tailwindcss.com` | Estilos |
| OpenCV.js 4.8.0 | `docs.opencv.org` (`<script async>`) | Detección de bordes / procesamiento de imagen |
| @imgly/background-removal 1.5.5 | `cdn.jsdelivr.net` (+ modelos desde `storage.googleapis.com` / `staticimgly.com`) | Quitar fondo de fotos |
| lucide-react | `aistudiocdn.com` (importmap) | Iconos |
| jsPDF 2.5.1 | `aistudiocdn.com` (importmap) + chunks locales en `assets/` | Generación de PDF |
| html2canvas | chunk local `assets/html2canvas.esm-Qh1iLaAE.js` | Utilidad de PDF (carga diferida) |
| MediaPipe tasks-vision 1.1.0 + BlazeFace | `cdn.jsdelivr.net` / `storage.googleapis.com` (worker `assets/face-guidance.worker.js`) | Guía facial en la captura de foto |

Declarada pero **aparentemente sin uso**:

- `@google/genai` aparece en el importmap, pero el bundle no instancia el SDK en ningún punto (0 llamadas). No hay IA remota: toda la "IA" es local (OpenCV + modelo de fondo).

Notas verificadas:

- No hay lockfile ni `node_modules`: la app es pre-compilada y las dependencias anteriores se descargan en el navegador.
- Los paquetes `purify.es-BwoZCkIS.js` y `index.es-C0sLXznL.js` en `assets/` son chunks de jsPDF (carga diferida).

## Estructura del proyecto

```
AdmisionScan/
├── index.html                 # Shell HTML + splash (mín. 3000 ms) + importmap
├── _redirects                 # Fallback SPA para Cloudflare Pages (/* /index.html 200)
├── package.json               # Solo scripts locales de servidor (sin dependencias instaladas)
├── README.md                  # Este archivo (UTF-8)
├── AGENTS.md                  # Instrucciones técnicas de mantenimiento
├── .gitignore / .gitattributes
├── dni_guideline.png          # Guía visual DNI (archivo JPEG con extensión .png)
├── document_guideline.png     # Guía visual A4 (ídem)
├── photo_guideline.png        # Guía visual de foto (ídem)
└── assets/
    ├── index-CVsQaZ5q.js      # Bundle principal de la app (precompilado, 2.520.377 B)
    ├── face-guidance.js       # Módulo de guía facial
    ├── face-guidance.worker.js# Worker (MediaPipe / BlazeFace)
    ├── html2canvas.esm-Qh1iLaAE.js, index.es-C0sLXznL.js,
    │   purify.es-BwoZCkIS.js  # Chunks de jsPDF (carga diferida)
    └── branding/              # Logos y paleta institucional UNSAAC
```

## Cómo ejecutar en local (Windows)

Requisitos: Node.js con `npm`/`npx` y conexión a la red (la primera ejecución de `npx` puede descargar `serve`).

1. **Servidor en el puerto 8080** (recomendado; la cámara solo funciona en `https` o `localhost`):

   ```
   cmd /c "npx serve -l 8080 ."
   ```

   Verificado en esta máquina: responde `GET /` con 200 y sirve el bundle completo (2.520.377 bytes).

2. **Scripts de `package.json`**:

   ```
   npm start
   ```

   (o `npm run dev`; ambos ejecutan `npx serve .`, que usa el puerto 3000 por defecto). Verificado en esta máquina: responde `GET /` con 200 en el puerto 3000.

Advertencia: en PowerShell, `npm`/`npx` pueden fallar con `PSSecurityException` por ExecutionPolicy; en ese caso usa `cmd /c "npx ..."` o `npx.cmd`.

## Cómo verificar que la aplicación funciona

No existen tests automatizados, lint, typecheck ni build: la verificación es manual.

1. Abrir `http://localhost:8080` → aparece el splash con el logo UNSAAC y la app se monta (el splash permanece un mínimo de **3000 ms**).
2. Consola del navegador: sin errores rojos de JavaScript.
3. El componente de OpenCV queda disponible en `window.cv` una vez descargado de la red.
4. Cámara: al aceptar el permiso aparece la vista previa; si se deniega, se muestra el mensaje de permiso con "Reintentar" y la opción "Subir desde Galería".
5. Escaneo de DNI y de A4: flujo con pasos → recorte con rotación → PDF/descarga.
6. Foto: captura → editor (zoom, "Quitar Fondo", descarga).
7. Comprobación de sintaxis del bundle: `node --check assets/index-CVsQaZ5q.js` (exit 0).

**Validado en sesiones previas** (reportado por el equipo, no re-ejecutado en esta actualización): flujos generales de la aplicación probados localmente y desde laptop y celular mediante un túnel temporal (Cloudflare Tunnel).

**Pendiente** (no probado todavía en dispositivo físico concreto): rotación, arrastre tras girar, PDF con orientación correcta y DNI anverso/reverso con rotaciones distintas en **iPhone/Safari** y **Android**; cámara ocupada; cámara frontal/trasera.

## Estado de Git y pasos pendientes

Ya realizado (en esta copia):

- `git init` con rama inicial `main`.
- `.gitattributes` (`* -text`, preserva los bytes tal cual) y `.gitignore`.
- 22 archivos preparados en el índice con `git add` (incluida la versión anterior de esta documentación).

Pendiente (lo ejecuta el propietario con autorización explícita; durante la actualización de esta documentación no se ejecutó ningún comando de escritura de Git):

1. Volver a preparar `README.md`, `AGENTS.md` y `package.json` (modificados ahora y aún sin re-agregar al índice).
2. Primer commit en `main`.
3. Crear el repositorio privado en GitHub y configurar el remoto.
4. `git push`.
5. Publicar en Cloudflare Pages (apartado siguiente).

## Publicación futura en Cloudflare Pages (no ejecutada aún)

Instrucciones **futuras**, ninguna realizada todavía:

1. Subir esta carpeta a un repositorio privado de GitHub (commit + push).
2. En Cloudflare Pages → crear proyecto → conectar el repositorio de GitHub (privado).
3. Build command: **vacío**; output directory: **raíz** (`/`). Este proyecto no tiene proceso de compilación.
4. El archivo `_redirects` ya está incluido y Cloudflare Pages lo aplica automáticamente para el fallback SPA.
5. Tras el despliegue, comprobar en la URL pública: carga, splash, consola, cámara (HTTPS) y descargas.

## Flujo de trabajo con ramas y pull requests (una vez exista el remoto)

1. `git pull origin main` antes de empezar.
2. Crear rama: `git checkout -b feature/mi-mejora`.
3. `git add <archivos>` y `git commit -m "feat: descripción del cambio"`.
4. `git push origin feature/mi-mejora`.
5. Abrir un Pull Request en GitHub para revisión y fusión a `main`.

## Limitaciones y dependencias externas

- **Requiere conexión a red:** React, Tailwind, OpenCV, @imgly, MediaPipe y los modelos se descargan de CDNs (`aistudiocdn.com`, `cdn.jsdelivr.net`, `docs.opencv.org`, `storage.googleapis.com`, `staticimgly.com`). Sin red la aplicación no arranca.
- **Sin backend:** nada se persiste en servidor; los datos solo viajan del navegador al dispositivo del usuario.
- **Rendimiento de la detección en vivo dependiente del frame completo** (diseño actual del detector).

## Hallazgos pendientes (documentados, sin corregir)

- `/index.css` se referencia en `index.html` pero el archivo no existe: produce un 404 en consola. Sin impacto funcional (los estilos están en línea + Tailwind).
- Los imports diferidos de jsPDF usan mayúsculas distintas a los archivos reales: el bundle pide `./html2canvas.esm-QH1iLAAe.js` y `./index.es-C0sLxZnl.js`, mientras que en disco están `html2canvas.esm-Qh1iLaAE.js` y `index.es-C0sLXznL.js`. En servidores sensibles a mayúsculas/minúsculas (Linux, Cloudflare Pages) esas rutas darían 404 si jsPDF llegara a usarlas; los flujos actuales no las usan.
- El bundle contiene texto con bytes de codificación dañados (mojibake) heredado del original: no se corrige, para preservar la identidad byte a byte.
- Validaciones en dispositivos físicos iPhone/Safari y Android: **pendientes** (ver arriba).
- Mejoras de interfaz para pantallas grandes: reservadas para una versión posterior.
