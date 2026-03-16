import { describe, expect, it } from 'vitest';
import { guessSavegameWrapper } from './savegame';

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

describe('guessSavegameWrapper', () => {
  it('detects dat-be wrapper', () => {
    const total = 20;
    const outSize = 4096;
    const payload = Uint8Array.from([
      ...u32be(total),
      ...u32be(0),
      ...u32be(outSize),
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
    ]);
    const w = guessSavegameWrapper(payload);
    expect(w.kind.startsWith('dat-be')).toBe(true);
    expect(w.headerLen).toBe(12);
    expect(w.expectedSize).toBe(outSize);
    expect(w.compOffset).toBe(12);
  });

  it('detects flag-le wrapper', () => {
    const outSize = 65536;
    const payload = Uint8Array.from([
      ...u32le(0),
      ...u32le(outSize),
      9,
      8,
      7,
      6,
      5,
      4,
      3,
      2,
    ]);
    const w = guessSavegameWrapper(payload);
    expect(w.kind).toBe('flag-le');
    expect(w.headerLen).toBe(8);
    expect(w.expectedSize).toBe(outSize);
    expect(w.compLen).toBe(payload.length - 8);
  });

  it('falls back to raw when no known wrapper matches', () => {
    const payload = Uint8Array.from([0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd, 1, 2, 3, 4, 5, 6, 7, 8]);
    const w = guessSavegameWrapper(payload);
    expect(w.kind).toBe('raw');
    expect(w.compOffset).toBe(0);
    expect(w.expectedSize).toBe(payload.length);
  });

  it('throws on too-small payload', () => {
    expect(() => guessSavegameWrapper(new Uint8Array(8))).toThrow('savegame.dat too small');
  });
});
