import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readResolutions } from './resolutions';
it.each([
  { extra: true },
  { action: 'overwrite' },
  { field: 'stable_id' },
  { action: 'clear', field: 'authors' },
  { expectedVersion: '-1' },
  { reviewer: '' },
  { hashVersion: 'canonical-json-v1' },
])('rejects unsafe reviewed resolution %j', async (patch) => {
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const entry = {
      sourceSha256: 'a'.repeat(64),
      entityKey: 'slug',
      field: 'notes',
      expectedHash: 'b'.repeat(64),
      expectedVersion: '1',
      hashVersion: 'pg-jsonb-text-v1',
      reviewer: 'synthetic',
      reviewedAt: '2026-10-02T00:00:00Z',
      action: 'clear',
      ...patch,
    };
    const p = join(root, 'resolution.json');
    await writeFile(p, JSON.stringify({ version: 1, entries: [entry] }), { mode: 0o600 });
    await expect(readResolutions(p)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
