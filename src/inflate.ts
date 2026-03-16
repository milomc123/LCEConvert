import { unzlibSync } from 'fflate';
import { xdecompress } from './xdecompress';

export async function inflatePayload(comp: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  // Try zlib first (some payloads are zlib-wrapped).
  try {
    const out = unzlibSync(comp);
    if (!expectedSize || out.length === expectedSize || out.length > expectedSize) {
      return out;
    }
  } catch {
    // ignore
  }

  // Fall back to XCompress LZX via wasm.
  return await xdecompress(comp, expectedSize);
}
