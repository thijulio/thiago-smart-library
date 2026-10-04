import { readFile } from 'node:fs/promises';
import { requirePrivate } from './private-files';
import type { SourceRow } from './contracts';
export interface NormalizationPolicy {
  seriesSentinels: string[];
  cachedFormulaFields: string[];
  emptyFormulaRows?: string[];
}
export interface ReviewedPolicy extends NormalizationPolicy {
  version: 1;
  sourceSha256: string;
  reviewer: string;
  reviewedAt: string;
}
export async function readPolicy(
  path: string | undefined,
  sourceSha256: string,
  rows: SourceRow[],
): Promise<ReviewedPolicy | undefined> {
  if (!path) return undefined;
  await requirePrivate(path);
  const p = JSON.parse(await readFile(path, 'utf8'));
  if (
    !p ||
    Object.keys(p)
      .filter((k) => k !== 'emptyFormulaRows')
      .sort()
      .join('|') !==
      [
        'version',
        'sourceSha256',
        'reviewer',
        'reviewedAt',
        'seriesSentinels',
        'cachedFormulaFields',
      ]
        .sort()
        .join('|') ||
    p.version !== 1 ||
    p.sourceSha256 !== sourceSha256 ||
    typeof p.reviewer !== 'string' ||
    !p.reviewer.trim() ||
    typeof p.reviewedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT.*Z$/.test(p.reviewedAt) ||
    !Number.isFinite(Date.parse(p.reviewedAt))
  )
    throw new Error('INVALID_IMPORT_POLICY');
  for (const key of ['seriesSentinels', 'cachedFormulaFields'])
    if (
      !Array.isArray(p[key]) ||
      p[key].some((v: unknown) => typeof v !== 'string' || !v.trim()) ||
      new Set(p[key]).size !== p[key].length
    )
      throw new Error('INVALID_IMPORT_POLICY');
  for (const key of p.cachedFormulaFields)
    if (
      !rows.some((row) =>
        row.cells.some(
          (c) => `${row.sheet}!${c.address}` === key && c.formula && c.cachedValue !== null,
        ),
      )
    )
      throw new Error('INVALID_FORMULA_CACHE_POLICY');
  if (p.emptyFormulaRows !== undefined) {
    if (
      !Array.isArray(p.emptyFormulaRows) ||
      new Set(p.emptyFormulaRows).size !== p.emptyFormulaRows.length
    )
      throw new Error('INVALID_EMPTY_FORMULA_POLICY');
    for (const locator of p.emptyFormulaRows) {
      const row = rows.find((r) => `${r.sheet}!${r.row}` === locator);
      if (
        !row ||
        row.sheet !== 'Untitled' ||
        !row.cells.some((c) => c.formula) ||
        !row.cells.every((c) =>
          c.formula
            ? c.header === 'Cover URL' && (c.cachedValue === null || c.cachedValue === '')
            : c.value === null || c.value === '',
        )
      )
        throw new Error('INVALID_EMPTY_FORMULA_POLICY');
    }
  }
  return p;
}
export const isReviewedEmptyRow = (row: SourceRow, policy?: NormalizationPolicy) =>
  policy?.emptyFormulaRows?.includes(`${row.sheet}!${row.row}`) ?? false;
