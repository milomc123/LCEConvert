import { describe, expect, it } from 'vitest';
import { align4k, i24be, i24le, i32be, i32le, readUtf16BeNullTerminated, u16be, u32be, u32le } from './bytes';

describe('bytes helpers', () => {
  it('reads endian-aware integers', () => {
    const b = Uint8Array.from([0x12, 0x34, 0x56, 0x78]);
    expect(u16be(b, 0)).toBe(0x1234);
    expect(u32be(b, 0)).toBe(0x12345678);
    expect(u32le(b, 0)).toBe(0x78563412);
  });

  it('reads signed 32-bit values', () => {
    const beNeg1 = Uint8Array.from([0xff, 0xff, 0xff, 0xff]);
    const leNeg2 = Uint8Array.from([0xfe, 0xff, 0xff, 0xff]);
    expect(i32be(beNeg1, 0)).toBe(-1);
    expect(i32le(leNeg2, 0)).toBe(-2);
  });

  it('reads 24-bit values', () => {
    const b = Uint8Array.from([0x01, 0x02, 0x03]);
    expect(i24be(b, 0)).toBe(0x010203);
    expect(i24le(b, 0)).toBe(0x030201);
  });

  it('aligns to 4k boundary', () => {
    expect(align4k(0)).toBe(0);
    expect(align4k(1)).toBe(0x1000);
    expect(align4k(0x1000)).toBe(0x1000);
    expect(align4k(0x1001)).toBe(0x2000);
  });

  it('reads utf16-be null terminated strings', () => {
    const data = Uint8Array.from([
      0x00,
      0x48, // H
      0x00,
      0x69, // i
      0x00,
      0x00, // terminator
      0x00,
      0x58, // ignored
    ]);
    expect(readUtf16BeNullTerminated(data, 0)).toBe('Hi');
  });
});
