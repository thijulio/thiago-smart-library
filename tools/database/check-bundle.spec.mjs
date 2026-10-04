import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBrowserBundleSafe } from './check-bundle.mjs';
test('rejects database driver and private SQL payloads in browser output', () => {
  for (const text of [
    'pg-protocol',
    'pg-pool',
    'MIGRATION_CHECKSUM_MISMATCH',
    'library.patch_book',
    'DB_MIGRATION_URL',
    'DB_IMPORT_URL',
    'exceljs',
  ])
    assert.throws(() => assertBrowserBundleSafe(text), /SERVER_DATABASE_CODE_IN_BROWSER/);
});
test('accepts ordinary UI output', () =>
  assert.doesNotThrow(() => assertBrowserBundleSafe('render title and author')));
