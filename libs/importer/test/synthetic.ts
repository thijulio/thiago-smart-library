import ExcelJS from 'exceljs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HEADERS, MAIN_HEADERS } from '../src/headers';
import { extractWorkbook } from '../src/extract-xlsx';
export type SyntheticBook = Record<string, ExcelJS.CellValue>;
export const books: SyntheticBook[] = [
  {
    'Book ID': 'legacy-book',
    Title: 'Synthetic One',
    Author: 'Example A & Example B',
    Platform: 'Kindle',
    Status: 'unread',
    Notes: 'Synthetic notes',
    Genre: null,
    Liked: '4.5',
    Pros: 'Synthetic pros',
  },
  {
    'Book ID': '00000000-0000-4000-8000-000000000002',
    Title: 'Synthetic Two',
    Author: 'Example A',
    Platform: 'Physical',
    Status: 'read',
    'Finished Date': '2026-05',
  },
  {
    'Book ID': 'synthetic-three',
    Title: 'Synthetic Three',
    Author: 'Example C',
    Platform: 'Audible',
    Status: 'wishlist',
  },
];
export async function syntheticSnapshot(
  input: SyntheticBook[] = books,
  time = '2026-10-02T00:00:00Z',
) {
  const root = await mkdtemp(join(tmpdir(), 'db02-synthetic-'));
  const w = new ExcelJS.Workbook();
  for (const [name, headers] of Object.entries(HEADERS)) {
    const s = w.addWorksheet(name);
    s.addRow([...headers]);
    if (name === 'Untitled') for (const b of input) s.addRow(MAIN_HEADERS.map((h) => b[h] ?? null));
  }
  const source = join(root, 'synthetic.xlsx');
  await w.xlsx.writeFile(source);
  const directory = join(root, 'snapshot');
  const manifest = await extractWorkbook({
    sourcePath: source,
    outputDirectory: directory,
    sourceKey: 'synthetic-library',
    effectiveAt: time,
    freshnessApprovedBy: 'synthetic-test',
  });
  return {
    root,
    directory,
    manifest,
    report: () => join(root, 'report-' + crypto.randomUUID()),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
