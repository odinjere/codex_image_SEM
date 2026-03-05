# SEM Viewer

Aplicación de escritorio para visualización y análisis básico de imágenes de microscopía electrónica de barrido (SEM), construida con **Tauri v1 + Rust + TypeScript vanilla**.

## Stack (fijado)

- `@tauri-apps/cli` `^1.6.0`
- `@tauri-apps/api` `^1.6.0`
- `tauri` `1.6`
- `tauri-build` `1.5`
- `vite` `^5.2.0`
- `typescript` `^5.4.0`
- `image` `0.25` (TIFF/PNG/JPEG)
- `rayon` `1.8`
- `serde` `1.0` + `derive`
- `serde_json` `1.0`

## Características principales

- Carga de imágenes SEM en escala de grises (TIFF/PNG/JPEG).
- Lectura de metadata básica de imagen.
- Histograma, ajuste de contraste y ecualización de histograma.
- Herramientas de medición:
  - distancia
  - área de polígono
  - ángulo
- Detección y conteo de partículas por umbral + componentes conectados (4-connectivity).
- Exportación de mediciones a CSV.
- Exportación de imagen procesada (PNG/TIFF/JPEG).

## Estructura del proyecto

```text
sem-viewer/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── main.ts
│   ├── core/
│   │   └── tauri-bridge.ts
│   ├── ui/
│   │   ├── canvas.ts
│   │   └── histogram.ts
│   └── types/
│       └── index.ts
└── src-tauri/
    ├── build.rs
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── image_processing.rs
        ├── measurements.rs
        ├── particles.rs
        └── formats.rs
```

## Requisitos

### Linux (dependencias del sistema para Tauri/WebKit)

```bash
sudo apt install libwebkit2gtk-4.0-dev libssl-dev libgtk-3-dev librsvg2-dev
```

### Toolchains

- Node.js 18+
- Rust (stable)

Instalación de Rust (si no está instalado):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Instalación

Desde la carpeta `sem-viewer/`:

```bash
npm install
```

## Desarrollo

```bash
npm run tauri dev
```

Esto inicia Vite en desarrollo y la ventana de escritorio Tauri con hot-reload.

## Build de producción

```bash
npm run tauri build
```

## Notas importantes de compatibilidad (Tauri v1)

- Imports JS de Tauri v1:
  - `@tauri-apps/api/tauri`
  - `@tauri-apps/api/dialog`
- No usar APIs/plugins de Tauri v2.
- `Uint8Array` debe convertirse con `Array.from(...)` antes de `invoke`.
- Parámetros opcionales hacia Rust (`Option<T>`) deben enviarse como `null` cuando no existan (no `undefined`).

## Flujo básico de uso

1. Abrir imagen (`Open`).
2. Explorar con pan/zoom en canvas.
3. Ajustar contraste desde histograma y gamma.
4. Medir distancia/área/ángulo con las herramientas de la barra.
5. Ejecutar detección de partículas desde el panel `Particles`.
6. Exportar resultados (CSV o imagen procesada).

## Estado

Versión inicial `0.1.0`.

Algunas funciones (como parseo profundo de metadata SEM DM3/DM4/TIFF tags) están planteadas como base para iteraciones futuras.
