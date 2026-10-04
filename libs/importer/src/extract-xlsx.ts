import ExcelJS from 'exceljs';
import { readFile, lstat, realpath, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Json, SnapshotManifest, SourceRow } from './contracts';
import { canonicalJson, sha256Bytes, sha256Utf8 } from './canonical-json';
import { privateOutput, privateWrite } from './private-files';
import { verifySnapshot } from './manifest';
import { archiveEntries, rawDateSerials } from './xlsx-archive';
export const EXTRACTOR_VERSION = 'exceljs-4.4.0-evidence-v1';
function evidence(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('INVALID_CELL_DATE');
    return { type: 'date', iso: value.toISOString() };
  }
  if (typeof value === 'string') {
    if (value.length > 1000000) throw new Error('CELL_LIMIT');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('INVALID_CELL_NUMBER');
    return value;
  }
  if (Array.isArray(value)) return value.map(evidence);
  if (typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, evidence(v)]));
  throw new Error('UNSUPPORTED_CELL');
}
export async function extractWorkbook(input: {
  sourcePath: string;
  outputDirectory: string;
  sourceKey: string;
  effectiveAt: string;
  freshnessApprovedBy: string;
}): Promise<SnapshotManifest> {
  if (
    extname(input.sourcePath).toLowerCase() !== '.xlsx' ||
    !(await lstat(input.sourcePath)).isFile()
  )
    throw new Error('INVALID_SOURCE');
  if (
    !input.sourceKey.trim() ||
    !input.freshnessApprovedBy.trim() ||
    !/^\d{4}-\d\d-\d\dT.*Z$/.test(input.effectiveAt) ||
    !Number.isFinite(Date.parse(input.effectiveAt))
  )
    throw new Error('INVALID_FRESHNESS');
  if ((await lstat(input.sourcePath)).size > 25 * 1024 * 1024) throw new Error('SOURCE_LIMIT');
  const bytes = await readFile(await realpath(input.sourcePath));
  const hash = sha256Bytes(bytes);
  const archive = archiveEntries(bytes);
  try {
    const prior = await verifySnapshot(input.outputDirectory);
    if (
      prior.manifest.sourceSha256 !== hash ||
      prior.manifest.sourceKey !== input.sourceKey ||
      prior.manifest.effectiveAt !== input.effectiveAt ||
      prior.manifest.freshnessApprovedBy !== input.freshnessApprovedBy
    )
      throw new Error('SNAPSHOT_OVERWRITE');
    return prior.manifest;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const rows: SourceRow[] = [];
  const sheets: SnapshotManifest['sheets'] = [];
  for (const sheet of workbook.worksheets) {
    const serials = rawDateSerials(archive, sheet.id);
    if (sheet.actualColumnCount > 100 || sheet.rowCount > 10001) throw new Error('SHEET_LIMIT');
    const headers: string[] = [];
    for (let i = 1; i <= sheet.actualColumnCount; i++) {
      const header = sheet.getRow(1).getCell(i);
      evidence(header.value);
      if (header.text.length > 1000000) throw new Error('CELL_LIMIT');
      headers.push(header.text);
    }
    // Never accept a merged tabular region. Retain original bytes on successful unmerged extraction.
    const merges = (sheet.model as { merges?: string[] }).merges ?? [];
    if (merges.length) throw new Error('MERGED_TABULAR_CELLS');
    let populated = 0;
    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      populated++;
      const cells = Array.from({ length: headers.length }, (_, index) => {
        const cell = row.getCell(index + 1);
        if (cell.text.length > 1000000) throw new Error('CELL_LIMIT');
        const val = cell.value;
        const f =
          val && typeof val === 'object' && 'formula' in val
            ? String(val.formula)
            : val && typeof val === 'object' && 'sharedFormula' in val
              ? String(val.sharedFormula)
              : null;
        return {
          column: index + 1,
          header: headers[index],
          address: cell.address,
          type:
            Object.entries(ExcelJS.ValueType).find(([, v]) => v === cell.type)?.[0] ??
            String(cell.type),
          value:
            val instanceof Date
              ? {
                  type: 'date',
                  iso: val.toISOString(),
                  excelSerial: serials.get(cell.address) ?? null,
                }
              : evidence(val),
          formula: f,
          cachedValue:
            f && val && typeof val === 'object' && 'result' in val ? evidence(val.result) : null,
          numberFormat: cell.numFmt ?? null,
        };
      });
      rows.push({ sheet: sheet.name, row: n, cells });
    });
    if (populated > 10000) throw new Error('ROW_LIMIT');
    sheets.push({ name: sheet.name, headers, populatedRows: populated });
  }
  const lines =
    rows.map((r) => canonicalJson(r as unknown as Json)).join('\n') + (rows.length ? '\n' : '');
  const manifest: SnapshotManifest = {
    version: 1,
    sourceKey: input.sourceKey,
    sourceSha256: hash,
    rowsSha256: sha256Utf8(lines),
    extractedAt: new Date().toISOString(),
    effectiveAt: input.effectiveAt,
    freshnessApprovedBy: input.freshnessApprovedBy,
    dateSystem: workbook.properties.date1904 ? '1904' : '1900',
    extractorVersion: EXTRACTOR_VERSION,
    sheets,
  };
  const out = await privateOutput(input.outputDirectory);
  try {
    await privateWrite(join(out, 'source.xlsx'), bytes);
    await privateWrite(join(out, 'rows.jsonl'), lines);
    await privateWrite(join(out, 'manifest.json'), canonicalJson(manifest as unknown as Json));
    await privateWrite(
      join(out, 'extraction-report.json'),
      canonicalJson({ sheets: sheets.length, rows: rows.length, sourceSha256: hash }),
    );
  } catch (e) {
    await rm(out, { recursive: true, force: true });
    throw e;
  }
  return manifest;
}
