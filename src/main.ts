import { StfsPackage } from './stfs';
import { guessSavegameWrapper } from './savegame';
import { inflatePayload } from './inflate';

const fileEl = document.getElementById('file') as HTMLInputElement;
const convertEl = document.getElementById('convert') as HTMLButtonElement;
const logEl = document.getElementById('log') as HTMLPreElement;

function log(msg: string) {
  logEl.textContent += msg + '\n';
}

function downloadBytes(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

fileEl.addEventListener('change', () => {
  convertEl.disabled = !(fileEl.files && fileEl.files.length > 0);
});

convertEl.addEventListener('click', async () => {
  logEl.textContent = '';
  const f = fileEl.files?.[0];
  if (!f) return;

  convertEl.disabled = true;
  try {
    log(`Reading: ${f.name} (${f.size} bytes)`);
    const buf = new Uint8Array(await f.arrayBuffer());

    const pkg = new StfsPackage(buf);
    log(`Package name: ${pkg.meta.displayName}`);

    const savegame = pkg.extractFileByName('savegame.dat');
    if (!savegame) {
      throw new Error('savegame.dat not found inside STFS');
    }
    log(`savegame.dat: ${savegame.length} bytes`);

    const wrap = guessSavegameWrapper(savegame);
    log(`Wrapper: ${wrap.kind}`);
    log(`Expected inflated size: ${wrap.expectedSize}`);

    const comp = savegame.subarray(wrap.compOffset, wrap.compOffset + wrap.compLen);
    const inflated = await inflatePayload(comp, wrap.expectedSize);
    log(`Inflated: ${inflated.length} bytes`);

    downloadBytes('saveData.ms', inflated);
    log('Downloaded saveData.ms');
  } catch (e) {
    log(String(e));
    console.error(e);
  } finally {
    convertEl.disabled = false;
  }
});
