/**
 * build_wasm.mjs — compile the XCompress/LZX decompressor to WebAssembly.
 *
 * Sources compiled:
 *   native/xcompress_lzxd/xdecompress_lzxd.c  — wrapper that exposes xdecompress()
 *   vendor/mspack/lzxd.c                       — libmspack LZX decoder (LGPL-2.1)
 *
 * Output written to:
 *   src/wasm/xdecompress.mjs   — ES module wrapper (Emscripten MODULARIZE)
 *   src/wasm/xdecompress.wasm  — binary WASM blob
 *
 * Requires `emcc` (Emscripten) to be on PATH, or set the EMCC env var.
 * Run via:  npm run build:wasm
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(repoRoot, 'src', 'wasm');
mkdirSync(outDir, { recursive: true });

const emcc = process.env.EMCC || 'emcc';

const mspackDir = path.resolve(repoRoot, 'vendor', 'mspack');
const lzxdC = path.resolve(mspackDir, 'lzxd.c');
const wrapperC = path.resolve(repoRoot, 'native', 'xcompress_lzxd', 'xdecompress_lzxd.c');

const outJs = path.resolve(outDir, 'xdecompress.mjs');

const args = [
  wrapperC,
  lzxdC,
  '-I',
  mspackDir,
  '-O3',
  '-s',
  'MODULARIZE=1',
  '-s',
  'EXPORT_ES6=1',
  '-s',
  'ENVIRONMENT=web',
  '-s',
  'ALLOW_MEMORY_GROWTH=1',
  '-s',
  "EXPORTED_RUNTIME_METHODS=['HEAPU8']",
  '-s',
  "EXPORTED_FUNCTIONS=['_xdecompress','_malloc','_free']",
  '-o',
  outJs,
];

const res = spawnSync(emcc, args, { stdio: 'inherit' });
if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log('Wrote', outJs);
