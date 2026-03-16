# LCEConvert

This repo contains a minimal, framework-free **web** converter for Minecraft Xbox 360 STFS saves.

## Run locally

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

### Requirements

- Node.js (for Vite)
- Emscripten (`emcc`) to build the XCompress/LZX decompressor to WASM (the dev/build scripts run this automatically)

## Testing

- Unit tests cover parsing and wrapper logic in `src/bytes.ts`, `src/savegame.ts`, and `src/stfs.ts`.
- Golden integration test (`src/golden.integration.test.ts`) converts a real save (The Hobbit Adventure Map) and validates the output hash.

## Attribution / licensing

- Vendored LZX decompressor code comes from **libmspack** (Stuart Caie) and is licensed under **LGPL-2.1**.
	- See `LICENSES/LGPL-2.1.txt` for the license text.
