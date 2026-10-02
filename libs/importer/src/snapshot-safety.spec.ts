import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syntheticSnapshot, books } from '../test/synthetic';
import { extractWorkbook } from './extract-xlsx';
import { verifySnapshot } from './manifest';
import { canonicalJson } from './canonical-json';
import { normalizeBook } from './normalize-book';
import { parseCompletion } from './parse-dates';
import type { CellEvidence } from './contracts';
const cell = (header: string, value: CellEvidence['value']): CellEvidence => ({
  header,
  value,
  column: 1,
  address: 'A2',
  type: 'String',
  formula: null,
  cachedValue: null,
  numberFormat: null,
});
it('canonical JSON rejects nonfinite/undefined and sorts keys preserving Unicode and array order', () => {
  expect(canonicalJson({ z: ' α ', a: [null, '', 1] })).toBe('{"a":[null,"",1],"z":" α "}');
  expect(() => canonicalJson(NaN)).toThrow();
  expect(() => canonicalJson({ x: undefined } as never)).toThrow();
});
it.each(['1900', '1904'] as const)(
  'typed dates, rich text and cached formulas retained for %s',
  async (system) => {
    const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
    try {
      const w = new ExcelJS.Workbook();
      w.properties.date1904 = system === '1904';
      const s = w.addWorksheet('Library');
      s.addRow(['Book ID', 'Title', 'Author', 'Platform', 'Status', 'Notes', 'Finished Date']);
      s.addRow([
        'slug',
        { richText: [{ font: { bold: true }, text: 'Synthetic ' }, { text: 'title' }] },
        'Example',
        'Kindle',
        'unread',
        { formula: '1+1', result: 2 },
        new Date('2026-05-02T00:00:00Z'),
      ]);
      s.getCell('G2').numFmt = 'yyyy-mm-dd';
      const path = join(root, 'synthetic.xlsx');
      await w.xlsx.writeFile(path);
      const out = join(root, 'snapshot');
      await extractWorkbook({
        sourcePath: path,
        outputDirectory: out,
        sourceKey: 'synthetic',
        effectiveAt: '2026-10-02T00:00:00Z',
        freshnessApprovedBy: 'synthetic',
      });
      const v = await verifySnapshot(out);
      expect(v.manifest.dateSystem).toBe(system);
      expect(v.rows[0].cells[5]).toMatchObject({ formula: '1+1', cachedValue: 2 });
      expect(v.rows[0].cells[1].value).toMatchObject({
        richText: [{ text: 'Synthetic ', font: { bold: true } }, { text: 'title' }],
      });
      expect(v.rows[0].cells[6].value).toMatchObject({
        type: 'date',
        iso: '2026-05-02T00:00:00.000Z',
      });
      expect(normalizeBook(v.rows[0], v.manifest).fields.notes).toMatchObject({
        kind: 'invalid',
        code: 'UNREVIEWED_FORMULA',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it('manifest tampering and source substitution are detected', async () => {
  const s = await syntheticSnapshot();
  try {
    const p = join(s.directory, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    m.unknown = true;
    await writeFile(p, JSON.stringify(m));
    await expect(verifySnapshot(s.directory)).rejects.toThrow('INVALID_MANIFEST');
    delete m.unknown;
    await writeFile(p, JSON.stringify(m));
    await writeFile(join(s.directory, 'source.xlsx'), 'changed');
    await expect(verifySnapshot(s.directory)).rejects.toThrow('SNAPSHOT_HASH_MISMATCH');
  } finally {
    await s.dispose();
  }
});
it('identical snapshot extraction returns original manifest; changed source refuses overwrite', async () => {
  const s = await syntheticSnapshot();
  try {
    const input = {
      sourcePath: join(s.root, 'synthetic.xlsx'),
      outputDirectory: s.directory,
      sourceKey: 'synthetic-library',
      effectiveAt: s.manifest.effectiveAt,
      freshnessApprovedBy: 'synthetic-test',
    };
    expect(await extractWorkbook(input)).toEqual(s.manifest);
    const w = new ExcelJS.Workbook();
    w.addWorksheet('Library').addRow(['changed']);
    await w.xlsx.writeFile(input.sourcePath);
    await expect(extractWorkbook(input)).rejects.toThrow('SNAPSHOT_OVERWRITE');
  } finally {
    await s.dispose();
  }
});
it('merged tabular cells fail before accepted snapshot output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('Library');
    s.addRow(['Book ID', 'Title']);
    s.addRow(['slug', 'synthetic']);
    s.mergeCells('A2:B2');
    const source = join(root, 'synthetic.xlsx');
    await w.xlsx.writeFile(source);
    await expect(
      extractWorkbook({
        sourcePath: source,
        outputDirectory: join(root, 'snapshot'),
        sourceKey: 'synthetic',
        effectiveAt: '2026-10-02T00:00:00Z',
        freshnessApprovedBy: 'synthetic',
      }),
    ).rejects.toThrow('MERGED_TABULAR_CELLS');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('public permissions on evidence are refused without chmod', async () => {
  const s = await syntheticSnapshot();
  try {
    await chmod(join(s.directory, 'rows.jsonl'), 0o644);
    await expect(verifySnapshot(s.directory)).rejects.toThrow('UNSAFE_PRIVATE_EVIDENCE');
  } finally {
    await s.dispose();
  }
});
it('invalid extension and repository output rejected', async () => {
  const s = await syntheticSnapshot();
  try {
    await expect(
      extractWorkbook({
        sourcePath: join(s.root, 'bad.csv'),
        outputDirectory: join(s.root, 'other'),
        sourceKey: 'synthetic',
        effectiveAt: s.manifest.effectiveAt,
        freshnessApprovedBy: 'synthetic',
      }),
    ).rejects.toThrow('INVALID_SOURCE');
    await expect(
      extractWorkbook({
        sourcePath: join(s.root, 'synthetic.xlsx'),
        outputDirectory: join(process.cwd(), 'forbidden-private'),
        sourceKey: 'synthetic',
        effectiveAt: s.manifest.effectiveAt,
        freshnessApprovedBy: 'synthetic',
      }),
    ).rejects.toThrow();
  } finally {
    await s.dispose();
  }
});
it('fake Excel leap day and untyped numeric years are unresolved', () => {
  expect(
    parseCompletion(cell('Finished Date', 60), cell('Year Finished', null), '1900'),
  ).toMatchObject({ value: null });
  expect(
    parseCompletion(cell('Finished Date', null), cell('Year Finished', 45000), '1900'),
  ).toMatchObject({ value: null });
});
it('reordered headers normalize identically and unknown cells remain evidence', async () => {
  const s = await syntheticSnapshot();
  try {
    const v = await verifySnapshot(s.directory);
    const row = v.rows[0];
    expect(normalizeBook({ ...row, cells: [...row.cells].reverse() }, v.manifest)).toMatchObject({
      stableId: books[0]['Book ID'],
      fields: normalizeBook(row, v.manifest).fields,
    });
  } finally {
    await s.dispose();
  }
});
it('original typed serial 60 is retained and quarantined instead of an invented Gregorian day', async () => {
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('Library');
    s.addRow(['Book ID', 'Title', 'Author', 'Platform', 'Status', 'Finished Date']);
    s.addRow(['slug', 'Synthetic', 'Example', 'Kindle', 'read', 60]);
    s.getCell('F2').numFmt = 'yyyy-mm-dd';
    const source = join(root, 'synthetic.xlsx');
    await w.xlsx.writeFile(source);
    const out = join(root, 'snapshot');
    await extractWorkbook({
      sourcePath: source,
      outputDirectory: out,
      sourceKey: 'synthetic',
      effectiveAt: '2026-10-02T00:00:00Z',
      freshnessApprovedBy: 'synthetic',
    });
    const v = await verifySnapshot(out);
    expect(normalizeBook(v.rows[0], v.manifest).fields.completion).toMatchObject({
      kind: 'invalid',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('formula cache is usable only through a snapshot-specific reviewed policy', async () => {
  const s = await syntheticSnapshot();
  try {
    const v = await verifySnapshot(s.directory);
    const row = v.rows[0];
    const target = row.cells.find((c) => c.header === 'Title')!;
    const formulaRow = {
      ...row,
      cells: row.cells.map((c) =>
        c === target
          ? {
              ...c,
              value: { formula: '"Synthetic"', result: 'Cached synthetic title' },
              formula: '"Synthetic"',
              cachedValue: 'Cached synthetic title',
            }
          : c,
      ),
    };
    expect(normalizeBook(formulaRow, v.manifest).fields.title.kind).toBe('invalid');
    expect(
      normalizeBook(formulaRow, v.manifest, {
        seriesSentinels: [],
        cachedFormulaFields: [`${row.sheet}!${target.address}`],
      }).fields.title,
    ).toEqual({ kind: 'value', value: 'Cached synthetic title' });
  } finally {
    await s.dispose();
  }
});
it('oversize input fails before workbook parsing', async () => {
  const { open } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const p = join(root, 'oversize.xlsx');
    const file = await open(p, 'w');
    await file.truncate(25 * 1024 * 1024 + 1);
    await file.close();
    await expect(
      extractWorkbook({
        sourcePath: p,
        outputDirectory: join(root, 'snapshot'),
        sourceKey: 'synthetic',
        effectiveAt: '2026-10-02T00:00:00Z',
        freshnessApprovedBy: 'synthetic',
      }),
    ).rejects.toThrow('SOURCE_LIMIT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('extraction never fetches hyperlinks, external sources or formulas', async () => {
  const { vi } = await import('vitest');
  const { default: http } = await import('node:http');
  const { default: https } = await import('node:https');
  const fetch = vi.spyOn(globalThis, 'fetch');
  const plain = vi.spyOn(http, 'request');
  const secure = vi.spyOn(https, 'request');
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const w = new ExcelJS.Workbook();
    const sheet = w.addWorksheet('Untitled');
    sheet.addRow(['Hyperlink', 'Formula']);
    sheet.addRow([
      { text: 'Synthetic link', hyperlink: 'https://example.invalid/no-fetch' },
      { formula: "'[https://example.invalid/external.xlsx]Sheet1'!A1", result: 1 },
    ]);
    const source = join(root, 'synthetic.xlsx');
    await w.xlsx.writeFile(source);
    await extractWorkbook({
      sourcePath: source,
      outputDirectory: join(root, 'snapshot'),
      sourceKey: 'synthetic',
      effectiveAt: '2026-10-02T00:00:00Z',
      freshnessApprovedBy: 'synthetic',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
    expect(secure).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    plain.mockRestore();
    secure.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
it.each(['columns', 'rows', 'cell', 'header'] as const)(
  'oversize %s fail before accepted output',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
    try {
      const w = new ExcelJS.Workbook();
      const sheet = w.addWorksheet('Untitled');
      sheet.addRow(
        kind === 'columns'
          ? Array.from({ length: 101 }, (_, i) => 'Header ' + i)
          : [kind === 'header' ? 'x'.repeat(1000001) : 'Title'],
      );
      if (kind === 'rows') for (let i = 0; i < 10001; i++) sheet.addRow(['Synthetic']);
      else sheet.addRow([kind === 'cell' ? 'x'.repeat(1000001) : 'Synthetic']);
      const source = join(root, 'synthetic.xlsx');
      await w.xlsx.writeFile(source);
      await expect(
        extractWorkbook({
          sourcePath: source,
          outputDirectory: join(root, 'snapshot'),
          sourceKey: 'synthetic',
          effectiveAt: '2026-10-02T00:00:00Z',
          freshnessApprovedBy: 'synthetic',
        }),
      ).rejects.toThrow(kind === 'cell' || kind === 'header' ? 'CELL_LIMIT' : 'SHEET_LIMIT');
      const { access } = await import('node:fs/promises');
      await expect(access(join(root, 'snapshot'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
