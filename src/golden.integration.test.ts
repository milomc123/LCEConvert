import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertStfsBinToSaveData } from './convert';

const HOBBIT_FIXTURE = new URL('../test/fixtures/TheHobbitMC.bin', import.meta.url);
const EXPECTED_SHA256 = '98ba14b8ebb06f331a18daed00a49c162102dbc1d8c20f79119a1b5ad0130d19';

describe('golden fixture conversion', () => {
  it(
    'converts TheHobbitMC.bin to stable saveData.ms bytes',
    async () => {
      const bytes = new Uint8Array(await readFile(HOBBIT_FIXTURE));
      const out = await convertStfsBinToSaveData(bytes);
      const sha = createHash('sha256').update(out).digest('hex');
      expect(sha).toBe(EXPECTED_SHA256);
    },
    120_000
  );
});
