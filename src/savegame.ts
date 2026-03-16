import { i32be, i32le, u32be, u32le } from './bytes';

export type SavegameWrapper = {
  headerLen: number;
  expectedSize: number;
  compOffset: number;
  compLen: number;
  kind: string;
};

export function guessSavegameWrapper(payload: Uint8Array): SavegameWrapper {
  if (payload.length < 16) throw new Error('savegame.dat too small');

  const cTotalBe = u32be(payload, 0);
  const cUnkBe = i32be(payload, 4);
  const cOutBe = u32be(payload, 8);
  if (12 <= payload.length && 8 <= cTotalBe && cTotalBe <= payload.length && 1024 <= cOutBe && cOutBe <= 512 * 1024 * 1024) {
    let compLen = Math.max(0, cTotalBe - 8);
    compLen = Math.min(compLen, Math.max(0, payload.length - 12));
    return { headerLen: 12, expectedSize: cOutBe, compOffset: 12, compLen, kind: `dat-be(unk=${cUnkBe})` };
  }

  const a0Be = u32be(payload, 0);
  const a1Be = u32be(payload, 4);
  if (a0Be === 0 && 1024 <= a1Be && a1Be <= 512 * 1024 * 1024) {
    return { headerLen: 8, expectedSize: a1Be, compOffset: 8, compLen: payload.length - 8, kind: 'flag-be' };
  }

  const cTotalLe = u32le(payload, 0);
  const cUnkLe = i32le(payload, 4);
  const cOutLe = u32le(payload, 8);
  if (12 <= payload.length && 8 <= cTotalLe && cTotalLe <= payload.length && 1024 <= cOutLe && cOutLe <= 512 * 1024 * 1024) {
    let compLen = Math.max(0, cTotalLe - 8);
    compLen = Math.min(compLen, Math.max(0, payload.length - 12));
    return { headerLen: 12, expectedSize: cOutLe, compOffset: 12, compLen, kind: `dat-le(unk=${cUnkLe})` };
  }

  const a0Le = u32le(payload, 0);
  const a1Le = u32le(payload, 4);
  if (a0Le === 0 && 1024 <= a1Le && a1Le <= 512 * 1024 * 1024) {
    return { headerLen: 8, expectedSize: a1Le, compOffset: 8, compLen: payload.length - 8, kind: 'flag-le' };
  }

  return { headerLen: 0, expectedSize: payload.length, compOffset: 0, compLen: payload.length, kind: 'raw' };
}
