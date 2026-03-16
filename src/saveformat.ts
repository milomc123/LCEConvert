import { zlibSync, unzlibSync } from 'fflate';
import { xdecompress } from './xdecompress';

type ParsedEntry = {
  name: string;
  nameUnits: number[];
  length: number;
  start: number;
  lastModified: bigint;
};

function u16be(b: Uint8Array, off: number): number {
  return ((b[off] << 8) | b[off + 1]) >>> 0;
}

function u16le(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8)) >>> 0;
}

function u32be(b: Uint8Array, off: number): number {
  return ((b[off] * 0x1000000 + (b[off + 1] << 16) + (b[off + 2] << 8) + b[off + 3]) >>> 0) >>> 0;
}

function u32le(b: Uint8Array, off: number): number {
  return ((b[off] + (b[off + 1] << 8) + (b[off + 2] << 16) + b[off + 3] * 0x1000000) >>> 0) >>> 0;
}

function putU16le(out: Uint8Array, off: number, n: number): void {
  out[off] = n & 0xff;
  out[off + 1] = (n >>> 8) & 0xff;
}

function putU32le(out: Uint8Array, off: number, n: number): void {
  out[off] = n & 0xff;
  out[off + 1] = (n >>> 8) & 0xff;
  out[off + 2] = (n >>> 16) & 0xff;
  out[off + 3] = (n >>> 24) & 0xff;
}

function putU64le(out: Uint8Array, off: number, n: bigint): void {
  let x = n;
  for (let i = 0; i < 8; i++) {
    out[off + i] = Number(x & 0xffn);
    x >>= 8n;
  }
}

function decodeUtf16Units(bytes: Uint8Array, littleEndian: boolean): number[] {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const unit = littleEndian ? u16le(bytes, i) : u16be(bytes, i);
    if (unit === 0) break;
    units.push(unit);
  }
  return units;
}

function unitsToString(units: number[]): string {
  let out = '';
  for (const unit of units) out += String.fromCharCode(unit);
  return out;
}

function decodeRle(input: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let inPos = 0;
  let outPos = 0;
  while (inPos < input.length && outPos < out.length) {
    const value = input[inPos++];
    if (value === 0xff) {
      if (inPos >= input.length) break;
      let count = input[inPos++];
      if (count < 3) {
        count += 1;
        for (let i = 0; i < count && outPos < out.length; i++) out[outPos++] = 0xff;
      } else {
        count += 1;
        if (inPos >= input.length) break;
        const data = input[inPos++];
        for (let i = 0; i < count && outPos < out.length; i++) out[outPos++] = data;
      }
    } else {
      out[outPos++] = value;
    }
  }
  return outPos === out.length ? out : out.subarray(0, outPos);
}

function encodeRle(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let inPos = 0;
  while (inPos < input.length) {
    const value = input[inPos++];
    let count = 1;
    while (inPos < input.length && input[inPos] === value && count < 256) {
      inPos++;
      count++;
    }
    if (count <= 3) {
      if (value === 0xff) {
        out.push(0xff, count - 1);
      } else {
        for (let i = 0; i < count; i++) out.push(value);
      }
    } else {
      out.push(0xff, count - 1, value);
    }
  }
  return Uint8Array.from(out);
}

function looksValid(raw: Uint8Array, littleEndian: boolean): boolean {
  if (raw.length < 12) return false;
  const u32 = littleEndian ? u32le : u32be;
  const u16 = littleEndian ? u16le : u16be;
  const indexOffset = u32(raw, 0);
  const rawCount = u32(raw, 4);
  const oldest = u16(raw, 8);
  const latest = u16(raw, 10);
  if (oldest > 13 || latest > 13 || latest < oldest) return false;
  const isOld = latest <= 1;
  if (isOld) {
    if (rawCount === 0 || rawCount % 136 !== 0) return false;
    const count = rawCount / 136;
    return indexOffset >= 12 && indexOffset + count * 136 <= raw.length;
  }
  const count = rawCount;
  return indexOffset >= 12 && indexOffset + count * 144 <= raw.length;
}

async function decodeChunkX360(comp: Uint8Array, outSize: number, useRle: boolean): Promise<Uint8Array> {
  const tryDecodeStage1 = async (cap: number): Promise<Uint8Array> => {
    try {
      return await xdecompress(comp, cap);
    } catch {
      try {
        return unzlibSync(comp);
      } catch {
        return comp;
      }
    }
  };

  if (!useRle) {
    const out = await tryDecodeStage1(outSize);
    return out.length <= outSize ? out : out.subarray(0, outSize);
  }

  const stage1 = await tryDecodeStage1(Math.max(outSize * 2, outSize));
  return decodeRle(stage1, outSize);
}

async function convertRegionX360ToLocal(region: Uint8Array): Promise<Uint8Array> {
  if (region.length < 8192) return region;

  const offsets = new Array<number>(1024).fill(0);
  const timestamps = new Array<number>(1024).fill(0);
  for (let i = 0; i < 1024; i++) offsets[i] = u32be(region, i * 4);
  for (let i = 0; i < 1024; i++) timestamps[i] = u32be(region, 4096 + i * 4);

  const chunkData = new Map<number, Uint8Array>();
  const usedSlots = new Set<number>();

  for (let i = 0; i < 1024; i++) {
    const off = offsets[i];
    if (!off) continue;
    const sector = off >>> 8;
    const sectors = off & 0xff;
    if (!sector || !sectors) continue;
    const byteOff = sector * 4096;
    if (byteOff + 8 > region.length) continue;

    let compLenFlag = u32be(region, byteOff);
    const decompLen = u32be(region, byteOff + 4);
    const useRle = (compLenFlag & 0x80000000) !== 0;
    compLenFlag &= 0x7fffffff;
    if (compLenFlag > sectors * 4096 || byteOff + 8 + compLenFlag > region.length) continue;

    const comp = region.subarray(byteOff + 8, byteOff + 8 + compLenFlag);
    const raw = await decodeChunkX360(comp, decompLen, useRle);
    const rle = encodeRle(raw);
    const z = zlibSync(rle);

    const out = new Uint8Array(8 + z.length);
    putU32le(out, 0, (z.length | 0x80000000) >>> 0);
    putU32le(out, 4, raw.length >>> 0);
    out.set(z, 8);
    chunkData.set(i, out);
    usedSlots.add(i);
  }

  const outChunks: number[] = [];
  const outOffsets = new Array<number>(1024).fill(0);
  let nextSector = 2;

  for (let i = 0; i < 1024; i++) {
    if (!usedSlots.has(i)) continue;
    const payload = chunkData.get(i)!;
    const sectorsNeeded = Math.floor((payload.length + 4095) / 4096);
    outOffsets[i] = ((nextSector << 8) | sectorsNeeded) >>> 0;
    outChunks.push(...payload);
    const pad = sectorsNeeded * 4096 - payload.length;
    for (let p = 0; p < pad; p++) outChunks.push(0);
    nextSector += sectorsNeeded;
  }

  const out = new Uint8Array(8192 + outChunks.length);
  for (let i = 0; i < 1024; i++) putU32le(out, i * 4, outOffsets[i]);
  for (let i = 0; i < 1024; i++) putU32le(out, 4096 + i * 4, timestamps[i]);
  out.set(Uint8Array.from(outChunks), 8192);
  return out;
}

export async function localizeSaveData(rawSave: Uint8Array): Promise<Uint8Array> {
  if (!looksValid(rawSave, false)) return rawSave;
  if (looksValid(rawSave, true)) return rawSave;

  const isOld = u16be(rawSave, 10) <= 1;
  if (isOld) return rawSave;

  const headerOffset = u32be(rawSave, 0);
  const fileCount = u32be(rawSave, 4);
  const originalVersion = u16be(rawSave, 8);
  const saveVersion = u16be(rawSave, 10);

  const entries: ParsedEntry[] = [];
  for (let i = 0; i < fileCount; i++) {
    const off = headerOffset + i * 144;
    const nameUnits = decodeUtf16Units(rawSave.subarray(off, off + 128), false);
    const name = unitsToString(nameUnits);
    const length = u32be(rawSave, off + 128);
    const start = u32be(rawSave, off + 132);
    const lastModified =
      (BigInt(u32be(rawSave, off + 136)) << 32n) |
      BigInt(u32be(rawSave, off + 140));

    if (start + length > headerOffset || start + length > rawSave.length) continue;
    entries.push({ name, nameUnits, length, start, lastModified });
  }

  const convertedFiles: { entry: ParsedEntry; data: Uint8Array }[] = [];
  for (const entry of entries) {
    const data = rawSave.subarray(entry.start, entry.start + entry.length);
    if (entry.name.toLowerCase().endsWith('.mcr')) {
      convertedFiles.push({ entry, data: await convertRegionX360ToLocal(data) });
    } else {
      convertedFiles.push({ entry, data: data.slice() });
    }
  }

  const newHeaderOffset = 12 + convertedFiles.reduce((acc, item) => acc + item.data.length, 0);
  const out = new Uint8Array(newHeaderOffset + convertedFiles.length * 144);
  putU32le(out, 0, newHeaderOffset >>> 0);
  putU32le(out, 4, convertedFiles.length >>> 0);
  putU16le(out, 8, originalVersion);
  putU16le(out, 10, saveVersion);

  let cursor = 12;
  for (const item of convertedFiles) {
    out.set(item.data, cursor);
    item.entry.start = cursor;
    item.entry.length = item.data.length;
    cursor += item.data.length;
  }

  for (let i = 0; i < convertedFiles.length; i++) {
    const { entry } = convertedFiles[i];
    const off = newHeaderOffset + i * 144;
    const capped = entry.nameUnits.slice(0, 63);
    for (let j = 0; j < capped.length; j++) putU16le(out, off + j * 2, capped[j]);
    putU16le(out, off + capped.length * 2, 0);
    putU32le(out, off + 128, entry.length >>> 0);
    putU32le(out, off + 132, entry.start >>> 0);
    putU64le(out, off + 136, entry.lastModified);
  }

  return out;
}
