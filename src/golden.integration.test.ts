import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { convertStfsBinToSaveData } from './convert';

const HOBBIT_FIXTURE = new URL('../test/fixtures/TheHobbitMC.bin', import.meta.url);
const EXPECTED_SHA256 = 'f9786a8bf8bff51cd361b103f529ad726548cd2cb9cfc502ab13ed4b12d42abc';

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
