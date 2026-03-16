export function u8(b: Uint8Array, off: number): number {
  return b[off] ?? 0;
}

export function u16be(b: Uint8Array, off: number): number {
  return ((u8(b, off) << 8) | u8(b, off + 1)) >>> 0;
}

export function u32be(b: Uint8Array, off: number): number {
  return (
    (u8(b, off) * 0x1000000 + (u8(b, off + 1) << 16) + (u8(b, off + 2) << 8) + u8(b, off + 3)) >>> 0
  );
}

export function u32le(b: Uint8Array, off: number): number {
  return (
    (u8(b, off) + (u8(b, off + 1) << 8) + (u8(b, off + 2) << 16) + u8(b, off + 3) * 0x1000000) >>> 0
  );
}

export function i32be(b: Uint8Array, off: number): number {
  const x = u32be(b, off);
  return x > 0x7fffffff ? x - 0x100000000 : x;
}

export function i32le(b: Uint8Array, off: number): number {
  const x = u32le(b, off);
  return x > 0x7fffffff ? x - 0x100000000 : x;
}

export function i24be(b: Uint8Array, off: number): number {
  return ((u8(b, off) << 16) | (u8(b, off + 1) << 8) | u8(b, off + 2)) >>> 0;
}

export function i24le(b: Uint8Array, off: number): number {
  return (u8(b, off) | (u8(b, off + 1) << 8) | (u8(b, off + 2) << 16)) >>> 0;
}

export function align4k(x: number): number {
  return (x + 0x0fff) & 0xfffff000;
}

export function readUtf16BeNullTerminated(b: Uint8Array, off: number, maxChars = 256): string {
  const out: number[] = [];
  let p = off;
  for (let i = 0; i < maxChars; i++) {
    if (p + 2 > b.length) break;
    const hi = b[p];
    const lo = b[p + 1];
    p += 2;
    if (hi === 0 && lo === 0) break;
    out.push(hi, lo);
  }
  try {
    return new TextDecoder('utf-16be', { fatal: false }).decode(new Uint8Array(out));
  } catch {
    // Safari doesn't support utf-16be label; do a manual decode.
    const dv = new DataView(new Uint8Array(out).buffer);
    let s = '';
    for (let i = 0; i + 1 < out.length; i += 2) {
      s += String.fromCharCode(dv.getUint16(i, false));
    }
    return s;
  }
}
