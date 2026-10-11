import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateReference } from './validate';
import type { SchemaReference } from './model';
export async function validateArtifact(directory: string, commit: string): Promise<void> {
  const files: Record<string, string | Uint8Array> = {};
  async function visit(path: string) {
    const entry = await lstat(join(directory, path));
    if (entry.isSymbolicLink()) throw new Error('UNSAFE_SCHEMA_ARTIFACT');
    if (entry.isDirectory()) {
      if (path && path !== 'assets') throw new Error('UNSAFE_SCHEMA_ARTIFACT');
      for (const name of await readdir(join(directory, path)))
        await visit(path ? path + '/' + name : name);
    } else if (entry.isFile()) files[path] = await readFile(join(directory, path));
    else throw new Error('UNSAFE_SCHEMA_ARTIFACT');
  }
  await visit('');
  const model = JSON.parse(
    Buffer.from(files['schema.json'] ?? '').toString('utf8'),
  ) as SchemaReference;
  if (model.sourceCommit !== commit) throw new Error('SOURCE_COMMIT_MISMATCH');
  validateReference(model, Buffer.from(files['schema.sql'] ?? '').toString('utf8'), files);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateArtifact('dist/schema-reference', process.argv[2] ?? '').catch(() => {
    console.error('SCHEMA_ARTIFACT_VALIDATION_FAILED');
    process.exitCode = 1;
  });
}
