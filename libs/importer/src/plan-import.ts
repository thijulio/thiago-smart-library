import type { NormalizationPolicy } from './import-policy';
import type { SqlClient } from '@smart-library/database';
import type {
  BookCandidate,
  ImportReport,
  Json,
  SnapshotManifest,
  SourceRow,
  Issue,
} from './contracts';
import type { Resolution } from './resolutions';
import { normalizeBook } from './normalize-book';
import { HEADERS, REQUIRED_HEADERS } from './headers';
import { mergeValue } from './merge-field';
import { parseCompletion } from './parse-dates';
import { canonicalJson } from './canonical-json';
export const BOOK_FIELDS = [
  'title',
  'platform',
  'status',
  'cover_url',
  'word_count',
  'next_rank',
  'next_slot',
  'why_next',
  'added_at',
  'series_label_raw',
  'series_id',
  'series_volume',
  'community_rating',
  'ratings_count',
  'rating_source',
  'rating_updated',
  'finished_from',
  'finished_to',
  'finished_precision',
  'finished_date_raw',
  'finished_year_raw',
] as const;
export const FEEDBACK_FIELDS = ['rating', 'opinion', 'opinion_raw', 'notes'] as const;
export const ASSESSMENT_FIELDS = [
  'pros',
  'cons',
  'personal_relevance',
  'relevance_reason',
  'relevance_updated',
] as const;
export const NUMBER_FIELDS = [
  'series_id',
  'series_volume',
  'community_rating',
  'ratings_count',
  'word_count',
  'next_rank',
  'rating',
  'personal_relevance',
];
export interface State {
  id: string;
  data: Record<string, Json>;
  versions: Record<string, string>;
  review: string;
  raw: Record<string, Record<string, Json>>;
}
export interface Change {
  candidate: BookCandidate;
  state: State | null;
  writes: Record<string, Json>;
  adopts: Record<string, Json>;
  reviewed: Set<string>;
}
export interface Plan {
  changes: Change[];
  report: ImportReport;
  resolutions: Resolution[];
}
export function ownerOf(field: string): string {
  return FEEDBACK_FIELDS.includes(field as (typeof FEEDBACK_FIELDS)[number])
    ? 'book_feedback'
    : ASSESSMENT_FIELDS.includes(field as (typeof ASSESSMENT_FIELDS)[number])
      ? 'book_assessments'
      : 'books';
}
export async function currentState(client: SqlClient): Promise<Map<string, State>> {
  const result = new Map<string, State>();
  const query =
    await client.query(`SELECT b.id::text AS id,b.stable_id,to_jsonb(b)||jsonb_build_object('id',b.id::text,'row_version',b.row_version::text,'series_id',b.series_id::text,'series_volume',trim_scale(b.series_volume)::text,'community_rating',trim_scale(b.community_rating)::text,'ratings_count',b.ratings_count::text,'word_count',b.word_count::text,'next_rank',b.next_rank::text) AS books,
 CASE WHEN f.book_id IS NOT NULL THEN to_jsonb(f)||jsonb_build_object('row_version',f.row_version::text,'rating',trim_scale(f.rating)::text) END AS feedback,
 CASE WHEN a.book_id IS NOT NULL THEN to_jsonb(a)||jsonb_build_object('row_version',a.row_version::text,'personal_relevance',trim_scale(a.personal_relevance)::text) END AS assessment,
 (SELECT jsonb_agg(x.name ORDER BY ba.position) FROM library.book_authors ba JOIN library.authors x ON x.id=ba.author_id WHERE ba.book_id=b.id) AS authors,
 (SELECT jsonb_agg(x.name ORDER BY x.name_key) FROM library.book_genres bg JOIN library.genres x ON x.id=bg.genre_id WHERE bg.book_id=b.id) AS genres,
 CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('name',s.name,'series_label_raw',b.series_label_raw,'series_volume',trim_scale(b.series_volume)::text,'published_count',s.published_count::text,'planned_count',s.planned_count::text,'status',s.status,'checked_at',s.checked_at::text) ELSE jsonb_build_object('name',NULL,'series_label_raw',b.series_label_raw,'series_volume',NULL,'published_count',NULL,'planned_count',NULL,'status',NULL,'checked_at',NULL) END AS series
 FROM library.books b LEFT JOIN library.book_feedback f ON f.book_id=b.id LEFT JOIN library.book_assessments a ON a.book_id=b.id LEFT JOIN library.series s ON s.id=b.series_id ORDER BY b.id`);
  for (const r of query.rows) {
    const data: Record<string, Json> = {};
    for (const k of BOOK_FIELDS) data[k] = r.books[k] ?? null;
    for (const k of FEEDBACK_FIELDS) data[k] = r.feedback?.[k] ?? null;
    for (const k of ASSESSMENT_FIELDS) data[k] = r.assessment?.[k] ?? null;
    data.authors = r.authors ?? [];
    data.genres = r.genres ?? [];
    data.series = r.series;
    data.completion = Object.fromEntries(
      [
        'finished_from',
        'finished_to',
        'finished_precision',
        'finished_date_raw',
        'finished_year_raw',
      ].map((k) => [k, r.books[k] ?? null]),
    );
    data.community = Object.fromEntries(
      ['community_rating', 'ratings_count', 'rating_source', 'rating_updated'].map((k) => [
        k,
        r.books[k] ?? null,
      ]),
    );
    result.set(r.stable_id, {
      id: r.id,
      data,
      versions: {
        books: r.books.row_version,
        book_feedback: r.feedback?.row_version ?? '0',
        book_assessments: r.assessment?.row_version ?? '0',
      },
      review: r.assessment?.review_state ?? 'unreviewed',
      raw: {
        books: r.books,
        book_feedback: r.feedback ?? {},
        book_assessments: r.assessment ?? {},
      },
    });
  }
  return result;
}
export async function planImport(
  client: SqlClient,
  manifest: SnapshotManifest,
  rows: SourceRow[],
  resolutions: Resolution[],
  runId: string | null,
  policy?: NormalizationPolicy,
): Promise<Plan> {
  const report: ImportReport = {
    runId,
    scope: 'core',
    sourceSha256: manifest.sourceSha256,
    status: 'dry-run',
    inserted: 0,
    updated: 0,
    unchanged: 0,
    quarantined: 0,
    conflicts: 0,
    issues: [],
    pendingScopes: ['enrichment', 'events'],
    exitCode: 0,
  };
  const add = (issue: Issue) => report.issues.push(issue);
  const main = manifest.sheets.filter((s) => s.name === 'Untitled');
  const mainSheet = main.length === 1 ? main[0] : undefined;
  const anchor = rows[0] ?? { sheet: 'Library', row: 1, cells: [] };
  const structureIssue = (field: string, code: string) =>
    add({ sheet: anchor.sheet, row: anchor.row, field, code, severity: 'blocking' });
  if (!mainSheet) structureIssue('snapshot', 'MISSING_OR_AMBIGUOUS_MAIN_SHEET');
  for (const name of Object.keys(HEADERS).filter((n) => n !== 'Untitled'))
    if (!manifest.sheets.some((s) => s.name === name)) structureIssue(name, 'MISSING_SHEET');
  for (const s of manifest.sheets)
    if (new Set(s.headers).size !== s.headers.length) structureIssue(s.name, 'DUPLICATE_HEADERS');
  if (mainSheet)
    for (const h of REQUIRED_HEADERS)
      if (!mainSheet.headers.includes(h)) structureIssue(h, 'MISSING_REQUIRED_HEADER');
  for (const s of manifest.sheets)
    if (s !== mainSheet && !HEADERS[s.name])
      add({
        sheet: s.name,
        row: rows.find((r) => r.sheet === s.name)?.row ?? 1,
        field: 'sheet',
        code: 'UNMAPPED_SHEET',
        severity: 'warning',
      });
  const candidates = rows
    .filter((r) => r.sheet === mainSheet?.name)
    .map((r) => normalizeBook(r, manifest, policy));
  const ids = new Set<string>();
  for (const c of candidates) {
    report.issues.push(...c.issues);
    if (ids.has(c.stableId))
      add({
        sheet: c.row.sheet,
        row: c.row.row,
        field: 'Book ID',
        code: 'DUPLICATE_STABLE_ID',
        severity: 'blocking',
      });
    ids.add(c.stableId);
  }
  // Reconcile matching series attributes using the latest attested checked date.
  const seriesGroups = new Map<string, BookCandidate[]>();
  for (const c of candidates)
    if (c.fields.series.kind === 'value') {
      const v = c.fields.series.value as Record<string, Json>;
      if (v.name !== null) {
        const key = String(v.name).trim().normalize('NFC').toLowerCase();
        seriesGroups.set(key, [...(seriesGroups.get(key) ?? []), c]);
      }
    }
  for (const group of seriesGroups.values()) {
    const signature = (c: BookCandidate) => {
      const v = (c.fields.series as { kind: 'value'; value: Json }).value as Record<string, Json>;
      return canonicalJson({
        published_count: v.published_count,
        planned_count: v.planned_count,
        status: v.status,
      });
    };
    if (new Set(group.map(signature)).size !== 1) {
      for (const c of group) {
        c.fields.series = { kind: 'invalid', code: 'SERIES_METADATA_CONFLICT' };
        add({
          sheet: c.row.sheet,
          row: c.row.row,
          field: 'series',
          code: 'SERIES_METADATA_CONFLICT',
          severity: 'warning',
        });
      }
      continue;
    }
    const latest =
      group
        .map((c) =>
          String(
            ((c.fields.series as { kind: 'value'; value: Json }).value as Record<string, Json>)
              .checked_at ?? '',
          ),
        )
        .sort()
        .at(-1) || null;
    for (const c of group)
      (
        (c.fields.series as { kind: 'value'; value: Json }).value as Record<string, Json>
      ).checked_at = latest;
  }
  const state = await currentState(client);
  const baselines = await client.query(
    'SELECT entity_key,field_name,source_value FROM import_audit.field_baselines WHERE source_key=$1 AND entity_kind=$2',
    [manifest.sourceKey, 'book'],
  );
  const baseline = new Map(
    baselines.rows.map((r) => [r.entity_key + '::' + r.field_name, r.source_value as Json]),
  );
  const head = (
    await client.query(
      'SELECT effective_at::text,source_sha256 FROM import_audit.source_heads WHERE source_key=$1',
      [manifest.sourceKey],
    )
  ).rows[0];
  if (
    head &&
    (Date.parse(head.effective_at) > Date.parse(manifest.effectiveAt) ||
      (Date.parse(head.effective_at) === Date.parse(manifest.effectiveAt) &&
        head.source_sha256 !== manifest.sourceSha256))
  )
    structureIssue('freshness', 'STALE_OR_EQUAL_TIME_SOURCE');
  const changes: Change[] = [];
  const used = new Set<Resolution>();
  for (const candidate of candidates) {
    const current = state.get(candidate.stableId) ?? null;
    const change: Change = {
      candidate,
      state: current,
      writes: {},
      adopts: {},
      reviewed: new Set(),
    };
    for (const [field, incoming] of Object.entries(candidate.fields)) {
      const d = current?.data[field] ?? null;
      const resolution = resolutions.find(
        (r) => r.entityKey === candidate.stableId && r.field === field,
      );
      if (resolution) {
        used.add(resolution);
        const hash = (
          await client.query('SELECT library.value_hash($1,$2,$3::jsonb) AS hash', [
            'merge.' + field,
            'json',
            JSON.stringify(d),
          ])
        ).rows[0].hash;
        if (
          resolution.sourceSha256 !== manifest.sourceSha256 ||
          !current ||
          resolution.expectedHash !== hash ||
          resolution.expectedVersion !== current.versions[ownerOf(field)]
        ) {
          add({
            sheet: candidate.row.sheet,
            row: candidate.row.row,
            field,
            code: 'STALE_RESOLUTION',
            severity: 'blocking',
          });
          continue;
        }
        change.reviewed.add(field);
        if (resolution.action === 'keep_database') {
          if (incoming.kind === 'value') change.adopts[field] = incoming.value;
          continue;
        }
        if (resolution.action === 'clear') {
          change.writes[field] =
            field === 'genres'
              ? []
              : field === 'completion'
                ? {
                    finished_from: null,
                    finished_to: null,
                    finished_precision: 'unknown',
                    finished_date_raw: null,
                    finished_year_raw: null,
                  }
                : field === 'community'
                  ? {
                      community_rating: null,
                      ratings_count: null,
                      rating_source: null,
                      rating_updated: null,
                    }
                  : field === 'series'
                    ? {
                        name: null,
                        series_label_raw: null,
                        series_volume: null,
                        published_count: null,
                        planned_count: null,
                        status: null,
                        checked_at: null,
                      }
                    : null;
          change.adopts[field] = incoming.kind === 'value' ? incoming.value : change.writes[field];
          continue;
        }
        if (
          field === 'completion' &&
          incoming.kind === 'invalid' &&
          incoming.code === 'YEAR_CELL_COERCION'
        ) {
          const finished = candidate.row.cells.find((c) => c.header === 'Finished Date');
          const year = candidate.row.cells.find((c) => c.header === 'Year Finished');
          if (finished && year) {
            const proposal = parseCompletion(finished, year, manifest.dateSystem);
            if (proposal.value && proposal.issues.every((code) => code === 'YEAR_CELL_COERCION')) {
              change.writes[field] = proposal.value;
              change.adopts[field] = proposal.value;
              continue;
            }
          }
        }
        if (incoming.kind !== 'value') {
          add({
            sheet: candidate.row.sheet,
            row: candidate.row.row,
            field,
            code: 'RESOLUTION_SOURCE_INVALID',
            severity: 'blocking',
          });
          continue;
        }
        change.writes[field] = incoming.value;
        change.adopts[field] = incoming.value;
        continue;
      }
      if (!current) {
        if (incoming.kind === 'value') {
          change.writes[field] = incoming.value;
          change.adopts[field] = incoming.value;
        }
        continue;
      }
      if (
        incoming.kind === 'value' &&
        ['completion', 'community', 'series'].includes(field) &&
        typeof incoming.value === 'object' &&
        incoming.value !== null &&
        !Array.isArray(incoming.value) &&
        typeof d === 'object' &&
        d !== null &&
        !Array.isArray(d) &&
        Object.entries(incoming.value).some(
          ([key, value]) => value === null && d[key] !== null && d[key] !== undefined,
        )
      ) {
        add({
          sheet: candidate.row.sheet,
          row: candidate.row.row,
          field,
          code: 'BLANK_GROUP_MEMBER',
          severity: 'warning',
        });
        continue;
      }
      const b = baseline.get(candidate.stableId + '::' + field);
      const emptyGroup =
        (field === 'genres' && Array.isArray(d) && d.length === 0) ||
        (['community', 'completion', 'series'].includes(field) &&
          typeof d === 'object' &&
          d !== null &&
          !Array.isArray(d) &&
          Object.entries(d).every(
            ([key, value]) =>
              value === null || (key === 'finished_precision' && value === 'unknown'),
          ));
      const m = mergeValue(b, incoming, b === undefined && emptyGroup ? null : d);
      if (
        ownerOf(field) === 'book_assessments' &&
        current.review === 'accepted' &&
        incoming.kind === 'value' &&
        canonicalJson(incoming.value) !== canonicalJson(d) &&
        m.action !== 'keep'
      )
        m.action = 'conflict';
      if (m.action === 'conflict') {
        report.conflicts++;
        add({
          sheet: candidate.row.sheet,
          row: candidate.row.row,
          field,
          code: 'FIELD_CONFLICT',
          severity: 'warning',
        });
      } else if (m.action === 'write') {
        change.writes[field] = m.value!;
        change.adopts[field] = m.value!;
      } else if (m.action === 'adopt' && incoming.kind === 'value')
        change.adopts[field] = incoming.value;
    }
    if (!current) report.inserted++;
    else if (
      Object.entries(change.writes).some(
        ([k, v]) => canonicalJson(v) !== canonicalJson(current.data[k] ?? null),
      )
    )
      report.updated++;
    else report.unchanged++;
    changes.push(change);
  }
  for (const r of resolutions) if (!used.has(r)) structureIssue(r.field, 'UNMATCHED_RESOLUTION');
  report.quarantined = report.issues.filter(
    (i) => i.code !== 'FIELD_CONFLICT' && i.severity === 'warning',
  ).length;
  report.exitCode = report.issues.some((i) => i.severity === 'blocking')
    ? 3
    : report.issues.length
      ? 2
      : 0;
  if (report.exitCode === 3) {
    report.status = 'blocked';
    report.inserted = 0;
    report.updated = 0;
  }
  return { changes, report, resolutions };
}
