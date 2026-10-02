import { it, expect } from 'vitest';
import { normalizeBook } from './normalize-book';
import { parseCompletion } from './parse-dates';
import { mergeValue } from './merge-field';
import type { CellEvidence, SourceRow, SnapshotManifest } from './contracts';
export const cell = (header: string, value: CellEvidence['value']): CellEvidence => ({
  header,
  value,
  column: 1,
  address: 'A2',
  type: 'String',
  formula: null,
  cachedValue: null,
  numberFormat: null,
});
const manifest = { dateSystem: '1900' } as SnapshotManifest;
const row = (values: Record<string, CellEvidence['value']>): SourceRow => ({
  sheet: 'Library',
  row: 2,
  cells: Object.entries(values).map(([h, v]) => cell(h, v)),
});
it.each([
  ['old', 'old', 'native', 'keep'],
  ['old', 'new', 'old', 'write'],
  ['old', 'new', 'new', 'adopt'],
  ['old', 'new', 'native', 'conflict'],
  [undefined, 'new', null, 'write'],
  [undefined, 'new', 'native', 'conflict'],
  [undefined, 'new', 'new', 'adopt'],
] as const)('three-way %s/%s/%s => %s', (b, i, d, action) =>
  expect(mergeValue(b, { kind: 'value', value: i }, d)).toMatchObject({ action }),
);
it.each(['blank', 'absent', 'invalid'] as const)('non-value %s never deletes', (kind) =>
  expect(
    mergeValue(
      'old',
      kind === 'invalid' ? { kind, code: 'SYNTHETIC_INVALID' } : { kind },
      'native',
    ),
  ).toEqual({ action: 'keep' }),
);
it.each([
  ['2026-03-05~06', '2026-03-05', '2026-03-06', 'range'],
  ['2026-04~05', '2026-04-01', '2026-05-31', 'range'],
  ['2026-05', '2026-05-01', '2026-05-31', 'month'],
  ['2026-06', '2026-06-01', '2026-06-30', 'month'],
  ['2026-07~08', '2026-07-01', '2026-08-31', 'range'],
  ['2026-08-10~11', '2026-08-10', '2026-08-11', 'range'],
  ['2024-02-29', '2024-02-29', '2024-02-29', 'day'],
])('completion %s retains uncertainty', (input, from, to, precision) =>
  expect(
    parseCompletion(cell('Finished Date', input), cell('Year Finished', null), '1900'),
  ).toMatchObject({
    value: { finished_from: from, finished_to: to, finished_precision: precision },
    issues: [],
  }),
);
it.each(['2026-02-30', '2026-03-06~05', 'Infinity', '2026-13'])(
  'invalid completion %s quarantined',
  (input) =>
    expect(
      parseCompletion(cell('Finished Date', input), cell('Year Finished', null), '1900'),
    ).toMatchObject({ value: null }),
);
it('normalizes by header, preserves slug, numeric title, prose and ordered aliases', () => {
  const n = normalizeBook(
    row({
      'Book ID': 'legacy-book',
      Title: 1984,
      Author: 'N. Gaiman & T. Pratchett',
      Platform: 'Kindle',
      Status: 'unread',
      Notes: '  synthetic\nα  ',
      Liked: '4.5⭐',
      Genre: 'Example; Synthetic',
    }),
    manifest,
  );
  expect(n).toMatchObject({
    stableId: 'legacy-book',
    authorKeys: ['neil gaiman', 'terry pratchett'],
    genreKeys: ['example', 'synthetic'],
    fields: {
      title: { kind: 'value', value: '1984' },
      notes: { kind: 'value', value: '  synthetic\nα  ' },
      rating: { kind: 'value', value: '4.5' },
    },
  });
});
it.each([' bad', 'bad ', 'bad::id', ''])('rejects invalid stable identity %s', (id) =>
  expect(normalizeBook(row({ 'Book ID': id }), manifest)).toMatchObject({
    issues: expect.arrayContaining([expect.objectContaining({ severity: 'blocking' })]),
  }),
);
it('quarantines unsafe URL and excessive rating precision', () =>
  expect(
    normalizeBook(
      row({
        'Book ID': 'slug',
        Title: 'Synthetic',
        Author: 'Example',
        Platform: 'Kindle',
        Status: 'unread',
        'Cover URL': 'javascript:alert(1)',
        Liked: '4.55',
      }),
      manifest,
    ),
  ).toMatchObject({ fields: { cover_url: { kind: 'invalid' }, rating: { kind: 'invalid' } } }));
it('coercion and conflicting years require review', () => {
  expect(
    parseCompletion(cell('Finished Date', null), cell('Year Finished', '2026-03'), '1900'),
  ).toMatchObject({ issues: ['YEAR_CELL_COERCION'] });
  expect(
    parseCompletion(cell('Finished Date', '2026-03'), cell('Year Finished', '2025'), '1900'),
  ).toMatchObject({ value: null, issues: ['COMPLETION_YEAR_CONFLICT'] });
});
it('source timestamps remain source metadata and never field authorship', () => {
  const n = normalizeBook(
    row({
      'Book ID': 'slug',
      Title: 'Synthetic',
      Author: 'Example',
      Platform: 'Kindle',
      Status: 'unread',
      'Updated At': '2026-10-02T12:30:00Z',
      'Updated By': 'Synthetic Source Editor',
    }),
    manifest,
  );
  expect(n).toMatchObject({
    sourceMetadata: {
      source_updated_at: '2026-10-02T12:30:00.000Z',
      source_updated_by: 'Synthetic Source Editor',
    },
  });
});
it.each([null, undefined])(
  'typed completion without original serial %s remains quarantined',
  (serial) => {
    const value = {
      type: 'date',
      iso: '2026-05-02T00:00:00Z',
      ...(serial === undefined ? {} : { excelSerial: serial }),
    };
    expect(
      parseCompletion(cell('Finished Date', value), cell('Year Finished', null), '1900'),
    ).toMatchObject({ value: null, issues: ['INVALID_COMPLETION'] });
  },
);
it.each(['2026-99', '2026-02-30'])(
  'impossible legacy year context %s cannot be approved as a coercion',
  (value) => {
    expect(
      parseCompletion(cell('Finished Date', null), cell('Year Finished', value), '1900'),
    ).toMatchObject({ value: null, issues: ['INVALID_COMPLETION'] });
  },
);
