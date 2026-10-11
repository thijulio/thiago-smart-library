import { expect, it } from 'vitest';
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateArtifact } from './artifact';
it('rejects an artifact symlink without reading its target', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'schema-artifact-'));
  try {
    await symlink('/etc/passwd', join(dir, 'schema.sql'));
    await expect(validateArtifact(dir, 'a'.repeat(40))).rejects.toThrow('UNSAFE_SCHEMA_ARTIFACT');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('rejects a stale or failed-build output instead of publishing leftovers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'schema-artifact-'));
  try {
    await writeFile(join(dir, 'schema.json'), JSON.stringify({ sourceCommit: 'b'.repeat(40) }));
    await expect(validateArtifact(dir, 'a'.repeat(40))).rejects.toThrow('SOURCE_COMMIT_MISMATCH');
    await mkdir(join(dir, 'unexpected'));
    await expect(validateArtifact(dir, 'a'.repeat(40))).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
