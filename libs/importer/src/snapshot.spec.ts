import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { extractWorkbook } from './extract-xlsx';
it('preserves exact bytes and whitespace in a private immutable snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  try {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Library');
    sheet.addRow(['Book ID', 'Title', 'Author', 'Platform', 'Status', 'Unknown']);
    sheet.addRow(['legacy-book', 1984, 'Example Author', 'Kindle', 'unread', '  α\nβ  ']);
    const source = join(root, 'synthetic.xlsx');
    await wb.xlsx.writeFile(source);
    const out = join(root, 'snapshot');
    const manifest = await extractWorkbook({
      sourcePath: source,
      outputDirectory: out,
      sourceKey: 'synthetic',
      effectiveAt: '2026-10-02T00:00:00Z',
      freshnessApprovedBy: 'synthetic-test',
    });
    expect(manifest).toMatchObject({
      version: 1,
      sourceSha256: createHash('sha256')
        .update(await readFile(source))
        .digest('hex'),
      dateSystem: '1900',
    });
    expect(await readFile(join(out, 'source.xlsx'))).toEqual(await readFile(source));
    expect(await readFile(join(out, 'rows.jsonl'), 'utf8')).toContain('  α\\nβ  ');
    expect((await stat(join(out, 'manifest.json'))).mode & 0o777).toBe(0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
