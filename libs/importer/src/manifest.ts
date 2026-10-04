import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Bytes, sha256Utf8 } from './canonical-json';
import { requirePrivate } from './private-files';
import type { SnapshotManifest, SourceRow } from './contracts';
const exact = (object: object, keys: string[]) =>
  Object.keys(object).sort().join('|') === keys.sort().join('|');
export async function verifySnapshot(
  directory: string,
): Promise<{ manifest: SnapshotManifest; rows: SourceRow[] }> {
  await requirePrivate(directory, true);
  for (const name of ['source.xlsx', 'rows.jsonl', 'manifest.json', 'extraction-report.json'])
    await requirePrivate(join(directory, name));
  const manifest: SnapshotManifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  );
  if (
    !exact(manifest, [
      'version',
      'sourceKey',
      'sourceSha256',
      'rowsSha256',
      'extractedAt',
      'effectiveAt',
      'freshnessApprovedBy',
      'dateSystem',
      'extractorVersion',
      'sheets',
    ]) ||
    manifest.version !== 1 ||
    !['1900', '1904'].includes(manifest.dateSystem) ||
    typeof manifest.sourceKey !== 'string' ||
    !manifest.sourceKey.trim() ||
    typeof manifest.freshnessApprovedBy !== 'string' ||
    !manifest.freshnessApprovedBy.trim() ||
    !/^\d{4}-\d\d-\d\dT.*Z$/.test(manifest.effectiveAt) ||
    !Number.isFinite(Date.parse(manifest.effectiveAt)) ||
    !Number.isFinite(Date.parse(manifest.extractedAt)) ||
    manifest.extractorVersion !== 'exceljs-4.4.0-evidence-v1' ||
    !Array.isArray(manifest.sheets)
  )
    throw new Error('INVALID_MANIFEST');
  const bytes = await readFile(join(directory, 'source.xlsx'));
  const lines = await readFile(join(directory, 'rows.jsonl'), 'utf8');
  if (
    bytes.length > 25 * 1024 * 1024 ||
    sha256Bytes(bytes) !== manifest.sourceSha256 ||
    sha256Utf8(lines) !== manifest.rowsSha256
  )
    throw new Error('SNAPSHOT_HASH_MISMATCH');
  const rows: SourceRow[] = lines.trimEnd()
    ? lines
        .trimEnd()
        .split('\n')
        .map((s) => JSON.parse(s))
    : [];
  const names = new Set<string>();
  const locators = new Set<string>();
  for (const s of manifest.sheets) {
    if (
      !exact(s, ['name', 'headers', 'populatedRows']) ||
      typeof s.name !== 'string' ||
      names.has(s.name) ||
      !Array.isArray(s.headers) ||
      s.headers.some((h) => typeof h !== 'string') ||
      s.headers.length > 100 ||
      !Number.isInteger(s.populatedRows) ||
      s.populatedRows < 0 ||
      s.populatedRows > 10000
    )
      throw new Error('INVALID_MANIFEST_SHEET');
    names.add(s.name);
  }
  for (const r of rows) {
    const sheet = manifest.sheets.find((s) => s.name === r.sheet);
    const key = r.sheet + '::' + r.row;
    if (
      !sheet ||
      locators.has(key) ||
      !Number.isInteger(r.row) ||
      r.row < 2 ||
      !exact(r, ['sheet', 'row', 'cells']) ||
      !Array.isArray(r.cells) ||
      r.cells.length !== sheet.headers.length
    )
      throw new Error('INVALID_SNAPSHOT_ROWS');
    locators.add(key);
    for (const [i, c] of r.cells.entries())
      if (
        !exact(c, [
          'column',
          'header',
          'address',
          'type',
          'value',
          'formula',
          'cachedValue',
          'numberFormat',
        ]) ||
        c.column !== i + 1 ||
        c.header !== sheet.headers[i] ||
        typeof c.address !== 'string' ||
        typeof c.type !== 'string' ||
        (c.formula !== null && typeof c.formula !== 'string') ||
        (c.numberFormat !== null && typeof c.numberFormat !== 'string')
      )
        throw new Error('INVALID_SNAPSHOT_CELL');
  }
  for (const s of manifest.sheets)
    if (rows.filter((r) => r.sheet === s.name).length !== s.populatedRows)
      throw new Error('INVALID_SNAPSHOT_COUNT');
  return { manifest, rows };
}
