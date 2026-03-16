import { inflatePayload } from './inflate';
import { guessSavegameWrapper } from './savegame';
import { StfsPackage } from './stfs';

export async function convertStfsBinToSaveData(bin: Uint8Array): Promise<Uint8Array> {
  const pkg = new StfsPackage(bin);
  const savegame = pkg.extractFileByName('savegame.dat');
  if (!savegame) {
    throw new Error('savegame.dat not found inside STFS');
  }

  const wrap = guessSavegameWrapper(savegame);
  const comp = savegame.subarray(wrap.compOffset, wrap.compOffset + wrap.compLen);
  return await inflatePayload(comp, wrap.expectedSize);
}
