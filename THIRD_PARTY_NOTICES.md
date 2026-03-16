# Third-Party Notices

## libmspack (LZX decompressor)

This project vendors a small subset of **libmspack** to implement LZX decompression in the browser (via WASM).

- Copyright: (C) 2003–2019 Stuart Caie
- License: GNU **Lesser** General Public License, Version 2.1 (LGPL-2.1)
- License text: `LICENSES/LGPL-2.1.txt`
- Vendored files:
  - `vendor/mspack/lzxd.c`
  - `vendor/mspack/lzx.h`
  - `vendor/mspack/system.h`
  - `vendor/mspack/mspack.h`
  - `vendor/mspack/readbits.h`
  - `vendor/mspack/readhuff.h`

Notes:
- The original source files contain their own copyright and license headers.
- These files are compiled to WebAssembly by `scripts/build_wasm.mjs`.

## fflate

Used for zlib decompression in the browser.

- Package: `fflate`
- Installed via npm (see `package.json` / `package-lock.json`)
- License: see the package’s own metadata and LICENSE file in the published package.

## Vite and TypeScript

Build tooling.

- Packages: `vite`, `typescript`
- Installed via npm (see `package.json` / `package-lock.json`)
- Licenses: see each package’s published LICENSE.
