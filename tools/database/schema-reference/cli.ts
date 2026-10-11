import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { withReferenceDatabase } from './provision';
import { inspectReference } from './catalog';
import { renderReference } from './render';
import { validateReference } from './validate';
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--source-commit' || !/^[a-f0-9]{40}$/.test(args[1]))
    throw new Error('INVALID_ARGUMENTS');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== args[1]) throw new Error('SOURCE_COMMIT_MISMATCH');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8',
  }).trim();
  if (dirty) throw new Error('UNCOMMITTED_SCHEMA_INPUTS');
  const files = await withReferenceDatabase(async (client, dump) => {
    const model = await inspectReference(client, commit);
    const sql = await dump();
    const roadmap = await readFile('docs/database/roadmap-schema-map.md', 'utf8');
    const output = await renderReference(model, sql, roadmap);
    validateReference(model, sql, output);
    return output;
  });
  const output = 'dist/schema-reference',
    staging = 'dist/schema-reference-staging',
    backup = 'dist/schema-reference-previous';
  await mkdir('dist', { recursive: true });
  for (const path of ['dist', output, staging, backup]) {
    const entry = await lstat(path).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (entry?.isSymbolicLink()) throw new Error('UNSAFE_OUTPUT_DIRECTORY');
  }
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging);
  try {
    for (const [path, data] of Object.entries(files)) {
      await mkdir(dirname(join(staging, path)), { recursive: true });
      await writeFile(join(staging, path), data);
    }
    await rm(backup, { recursive: true, force: true });
    const exists = await lstat(output).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (exists) await rename(output, backup);
    try {
      await rename(staging, output);
    } catch (e) {
      if (exists) await rename(backup, output);
      throw e;
    }
    await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log('SCHEMA_REFERENCE_GENERATED ' + commit);
}
main().catch(() => {
  console.error('SCHEMA_REFERENCE_GENERATION_FAILED');
  process.exitCode = 1;
});
