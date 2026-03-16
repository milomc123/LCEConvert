# LCEConvert

This repo contains a minimal, framework-free **web** converter for Minecraft Xbox 360 STFS saves.

## Web version

Run locally:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

### Requirements

- Node.js (for Vite)
- Emscripten (`emcc`) to build the XCompress/LZX decompressor to WASM (the dev/build scripts run this automatically)

## Legacy

This repo is now web-only; historical tooling can be kept elsewhere.

## Attribution / licensing

- Vendored LZX decompressor code comes from **libmspack** (Stuart Caie) and is licensed under **LGPL-2.1**.
	- See `THIRD_PARTY_NOTICES.md` for details and file list.
	- See `LICENSES/LGPL-2.1.txt` for the license text.

## Repo layout (high level)

- `/` (repo root) — browser UI + TypeScript converter + WASM build pipeline
- `native/` — C sources used to build the decompressor (native + WASM)
- `vendor/mspack/` — vendored libmspack LZX sources (`lzxd.c` + headers)
- `LICENSES/` — third-party license texts
