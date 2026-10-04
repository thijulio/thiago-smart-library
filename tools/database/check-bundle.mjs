import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Complements Nx import boundaries with a scan of actual built frontend bytes. */
export function assertBrowserBundleSafe(text) {
  if (
    /pg-protocol|pg-pool|MIGRATION_CHECKSUM_MISMATCH|library\.(patch_book|create_book)|DB_(MIGRATION|IMPORT|OWNER)_URL|exceljs|libs\/(database|importer)/i.test(
      text,
    )
  )
    throw new Error('SERVER_DATABASE_CODE_IN_BROWSER');
}
async function scan(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('UNEXPECTED_BUNDLE_SYMLINK');
    if (entry.isDirectory()) count += await scan(path);
    else if (/\.(js|html|map)$/.test(path)) {
      assertBrowserBundleSafe(await readFile(path, 'utf8'));
      count++;
    }
  }
  return count;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const count = await scan('dist/apps/web');
    if (!count) throw new Error('MISSING_BROWSER_OUTPUT');
    console.log(`BROWSER_DATABASE_BOUNDARY_OK files=${count}`);
  } catch {
    console.error('BROWSER_DATABASE_BOUNDARY_FAILED');
    process.exitCode = 1;
  }
}
