import { lstat, realpath, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
export async function privateOutput(path: string, repo = process.cwd()): Promise<string> {
  const parent = await realpath(dirname(resolve(path)));
  const target = resolve(parent, resolve(path).split('/').at(-1)!);
  const root = await realpath(repo);
  const rel = relative(root, target);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel)))
    throw new Error('PRIVATE_OUTPUT_IN_REPOSITORY');
  try {
    await lstat(target);
    throw new Error('OUTPUT_EXISTS');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await mkdir(target, { mode: 0o700 });
  return target;
}
export async function privateWrite(path: string, value: string | Buffer) {
  await writeFile(path, value, { mode: 0o600, flag: 'wx' });
}
export async function requirePrivate(path: string, directory = false) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    info.mode & 0o077
  )
    throw new Error('UNSAFE_PRIVATE_EVIDENCE');
  return stat(path);
}
