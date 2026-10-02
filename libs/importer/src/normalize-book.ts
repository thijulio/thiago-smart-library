import type {
  BookCandidate,
  CellEvidence,
  CandidateField,
  Json,
  SnapshotManifest,
  SourceRow,
} from './contracts';
import { HEADERS, MAIN_HEADERS } from './headers';
import { dateText, parseCompletion, parseDate } from './parse-dates';
import { decimal, integer, safeUrl } from './parse-numbers';
import { names, lookupKey } from './lookup-keys';
import type { NormalizationPolicy } from './import-policy';
export const SCALARS: Record<string, string> = {
  Title: 'title',
  Platform: 'platform',
  Status: 'status',
  Liked: 'rating',
  Opinion: 'opinion',
  Notes: 'notes',
  'Cover URL': 'cover_url',
  'Next Rank': 'next_rank',
  'Why Next': 'why_next',
  Pros: 'pros',
  Cons: 'cons',
  'Next Slot': 'next_slot',
  'Personal Relevance': 'personal_relevance',
  'Relevance Reason': 'relevance_reason',
  'Relevance Updated': 'relevance_updated',
  'Added At': 'added_at',
  'Word Count': 'word_count',
};
const empty = (header: string): CellEvidence => ({
  column: 0,
  header,
  address: '',
  type: 'Null',
  value: null,
  formula: null,
  cachedValue: null,
  numberFormat: null,
});
export function cellText(c: CellEvidence): string | null {
  if (c.value === null || c.value === '') return null;
  if (typeof c.value === 'string' || typeof c.value === 'number' || typeof c.value === 'boolean')
    return String(c.value);
  if (typeof c.value === 'object' && !Array.isArray(c.value)) {
    if (Array.isArray(c.value.richText))
      return c.value.richText
        .map((v) =>
          typeof v === 'object' && v !== null && !Array.isArray(v) ? String(v.text ?? '') : '',
        )
        .join('');
    if (typeof c.value.text === 'string') return c.value.text;
  }
  return dateText(c);
}
export function normalizeBook(
  row: SourceRow,
  manifest: SnapshotManifest,
  policy?: NormalizationPolicy,
): BookCandidate {
  const cells = new Map(
    row.cells.map((c) => [
      c.header,
      policy?.cachedFormulaFields.includes(`${row.sheet}!${c.address}`) &&
      c.formula &&
      c.cachedValue !== null
        ? { ...c, formula: null, value: c.cachedValue }
        : c,
    ]),
  );
  const get = (h: string) => cells.get(h) ?? empty(h);
  const n: BookCandidate = {
    sourceMetadata: {},
    stableId: cellText(get('Book ID')) ?? '',
    row,
    fields: {},
    authorKeys: [],
    genreKeys: [],
    issues: [],
    dispositions: {},
  };
  const issue = (field: string, code: string, blocking = false) => {
    n.issues.push({
      sheet: row.sheet,
      row: row.row,
      field,
      code,
      severity: blocking ? 'blocking' : 'warning',
    });
    n.dispositions[field] = 'invalid';
  };
  const parse = (header: string, fn: (s: string) => Json, required = false): CandidateField => {
    const c = get(header);
    if (!cells.has(header)) {
      issue(header, 'MISSING_HEADER', required);
      return { kind: 'absent' };
    }
    const text = cellText(c);
    if (c.formula) {
      issue(header, 'UNREVIEWED_FORMULA', required);
      return { kind: 'invalid', code: 'UNREVIEWED_FORMULA' };
    }
    if (text === null || !text.trim()) {
      n.dispositions[header] = 'empty';
      if (required) issue(header, 'REQUIRED_VALUE', true);
      return { kind: 'blank' };
    }
    try {
      const value = fn(text);
      n.dispositions[header] = 'accepted';
      return { kind: 'value', value };
    } catch (error) {
      const code =
        (error as Error).message === 'SERIES_POLICY_REQUIRED'
          ? 'SERIES_POLICY_REQUIRED'
          : 'INVALID_FIELD';
      issue(header, code, required);
      return { kind: 'invalid', code };
    }
  };
  if (
    typeof get('Book ID').value !== 'string' ||
    !n.stableId ||
    n.stableId.trim() !== n.stableId ||
    !/^[\x21-\x7e]+$/.test(n.stableId) ||
    n.stableId.includes('::')
  )
    issue('Book ID', 'INVALID_STABLE_ID', true);
  else n.dispositions['Book ID'] = 'accepted';
  for (const [header, key] of Object.entries(SCALARS))
    n.fields[key] = parse(
      header,
      (s) => {
        if (key === 'title') return s.trim();
        if (key === 'platform' && !['Audible', 'Kindle', 'Physical', 'Unknown'].includes(s))
          throw new Error();
        if (key === 'status' && !['read', 'wishlist', 'unread', 'reading', 'paused'].includes(s))
          throw new Error();
        if (key === 'rating') return decimal(s, 5, 1);
        if (key === 'personal_relevance') return decimal(s, 10, 2);
        if (key === 'word_count') return integer(s, 2147483647n, 1n);
        if (key === 'next_rank') return integer(s, 32767n, 1n);
        if (key === 'cover_url') return safeUrl(s);
        if (key === 'next_slot' && !['Primary', 'Secondary'].includes(s)) throw new Error();
        if (['added_at', 'relevance_updated'].includes(key)) {
          const d = parseDate(s);
          if (d.precision !== 'day') throw new Error();
          return d.from;
        }
        return s;
      },
      ['title', 'platform', 'status'].includes(key),
    );
  n.fields.opinion_raw = n.fields.opinion;
  if (n.fields.opinion.kind === 'value' && n.fields.opinion.value === '🧹') {
    n.fields.opinion = { kind: 'value', value: null };
    issue('Opinion', 'OPINION_SENTINEL');
  }
  n.fields.authors = parse('Author', (s) => names(s, '&', true), true);
  if (n.fields.authors.kind === 'value')
    n.authorKeys = (n.fields.authors.value as string[]).map(lookupKey);
  n.fields.genres = parse('Genre', (s) =>
    names(s, ';').sort((a, b) =>
      lookupKey(a) < lookupKey(b) ? -1 : lookupKey(a) > lookupKey(b) ? 1 : 0,
    ),
  );
  if (n.fields.genres.kind === 'value')
    n.genreKeys = (n.fields.genres.value as string[]).map(lookupKey);
  const completion = parseCompletion(
    get('Finished Date'),
    get('Year Finished'),
    manifest.dateSystem,
  );
  n.fields.completion = completion.value
    ? { kind: 'value', value: completion.value }
    : { kind: 'blank' };
  for (const code of completion.issues) issue('completion', code);
  if (completion.issues.length)
    n.fields.completion = { kind: 'invalid', code: completion.issues[0] };
  for (const h of ['Finished Date', 'Year Finished'])
    n.dispositions[h] = completion.issues.length
      ? 'unresolved'
      : completion.value
        ? 'accepted'
        : 'empty';
  const community: Record<string, Json> = {};
  let bad = false,
    has = false;
  for (const [h, k] of Object.entries({
    'Community Rating': 'community_rating',
    'Ratings Count': 'ratings_count',
    'Rating Source': 'rating_source',
    'Rating Updated': 'rating_updated',
  })) {
    const p = parse(h, (s) =>
      k === 'community_rating'
        ? decimal(s, 5, 2)
        : k === 'ratings_count'
          ? integer(s, 9223372036854775807n)
          : k === 'rating_updated'
            ? (() => {
                const d = parseDate(s);
                if (d.precision !== 'day') throw new Error();
                return d.from;
              })()
            : s,
    );
    bad ||= p.kind === 'invalid';
    has ||= p.kind === 'value';
    community[k] = p.kind === 'value' ? p.value : null;
  }
  n.fields.community = bad
    ? { kind: 'invalid', code: 'INVALID_COMMUNITY_GROUP' }
    : has
      ? { kind: 'value', value: community }
      : { kind: 'blank' };
  const seriesLabel = cellText(get('Series'));
  n.fields.series = parse('Series', (s) => {
    if (!policy) throw new Error('SERIES_POLICY_REQUIRED');
    const sentinel = policy.seriesSentinels.includes(s);
    const data: Record<string, Json> = {
      name: sentinel ? null : s,
      series_label_raw: s,
      series_volume: null,
      published_count: null,
      planned_count: null,
      status: null,
      checked_at: null,
    };
    if (!sentinel)
      for (const [h, k] of Object.entries({
        'Series Volume': 'series_volume',
        'Series Published': 'published_count',
        'Series Planned Total': 'planned_count',
        'Series Status': 'status',
        'Series Checked': 'checked_at',
      })) {
        const value = cellText(get(h));
        if (get(h).formula) throw new Error();
        if (value !== null) {
          data[k] =
            k === 'series_volume'
              ? decimal(value, 1e9, 6)
              : k.endsWith('_count')
                ? integer(value, 2147483647n)
                : k === 'checked_at'
                  ? (() => {
                      const d = parseDate(value);
                      if (d.precision !== 'day') throw new Error();
                      return d.from;
                    })()
                  : value;
          if (k === 'status' && !['Complete', 'Ongoing', 'No sequence', 'Unknown'].includes(value))
            throw new Error();
        }
      }
    if (data.series_volume === '0') throw new Error();
    if (
      data.published_count !== null &&
      data.planned_count !== null &&
      BigInt(String(data.published_count)) > BigInt(String(data.planned_count))
    )
      throw new Error();
    return data;
  });
  for (const h of [
    'Series Volume',
    'Series Published',
    'Series Planned Total',
    'Series Status',
    'Series Checked',
  ])
    n.dispositions[h] = seriesLabel ? 'derived/evidence-only' : 'empty';
  for (const h of ['Read?', 'Updated At', 'Updated By'])
    n.dispositions[h] = 'derived/evidence-only';
  const updatedValue = get('Updated At').value;
  const updated =
    updatedValue &&
    typeof updatedValue === 'object' &&
    !Array.isArray(updatedValue) &&
    typeof updatedValue.iso === 'string'
      ? updatedValue.iso
      : cellText(get('Updated At'));
  if (updated !== null) {
    if (
      get('Updated At').formula ||
      !/^\d{4}-\d\d-\d\dT.*Z$/.test(updated) ||
      !Number.isFinite(Date.parse(updated))
    )
      issue('Updated At', 'INVALID_SOURCE_TIMESTAMP');
    else n.sourceMetadata.source_updated_at = new Date(updated).toISOString();
  }
  const by = cellText(get('Updated By'));
  if (by !== null && !get('Updated By').formula) n.sourceMetadata.source_updated_by = by;
  const read = cellText(get('Read?'));
  if (read && !['true', 'yes', '1', 'false', 'no', '0'].includes(read.toLowerCase()))
    issue('Read?', 'UNRESOLVED_READ_FLAG');
  else if (
    read &&
    n.fields.status.kind === 'value' &&
    ['true', 'yes', '1'].includes(read.toLowerCase()) !== (n.fields.status.value === 'read')
  )
    issue('Read?', 'READ_STATUS_DISAGREEMENT');
  for (const h of MAIN_HEADERS) if (!n.dispositions[h]) n.dispositions[h] = 'empty';
  for (const c of row.cells)
    if (!HEADERS.Untitled.includes(c.header)) {
      issue(c.header, 'UNMAPPED_COLUMN');
      n.dispositions[c.header] = 'unresolved';
    }
  return n;
}
