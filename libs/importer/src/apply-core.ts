import type { SqlClient } from '@smart-library/database';
import type { Json, SnapshotManifest } from './contracts';
import type { Change, Plan } from './plan-import';
import { BOOK_FIELDS, FEEDBACK_FIELDS, ASSESSMENT_FIELDS, NUMBER_FIELDS } from './plan-import';
import { canonicalJson } from './canonical-json';
import { lookupKey, ALIASES } from './lookup-keys';
async function lookup(
  client: SqlClient,
  table: 'authors' | 'genres' | 'series',
  name: string,
  runId: string,
): Promise<string> {
  const r = await client.query(
    `INSERT INTO library.${table}(name,name_key,updated_by,last_import_run_id) VALUES($1,$2,session_user,$3) ON CONFLICT(name_key) DO NOTHING RETURNING id::text`,
    [name, lookupKey(name), runId],
  );
  const id =
    r.rows[0]?.id ??
    (
      await client.query(`SELECT id::text FROM library.${table} WHERE name_key=$1`, [
        lookupKey(name),
      ])
    ).rows[0].id;
  if (table === 'authors')
    for (const [key, target] of Object.entries(ALIASES))
      if (lookupKey(target) === lookupKey(name))
        await client.query(
          'INSERT INTO library.author_aliases(alias_key,alias,author_id,resolution_note) VALUES($1,$2,$3,$4) ON CONFLICT(alias_key) DO NOTHING',
          [key, key, id, 'reviewed-alias-map-v1'],
        );
  return id;
}
function expanded(writes: Record<string, Json>): Record<string, Json> {
  const result: Record<string, Json> = {};
  for (const [k, v] of Object.entries(writes))
    if (['completion', 'community'].includes(k)) Object.assign(result, v);
    else if (!['series', 'authors', 'genres'].includes(k)) result[k] = v;
  return result;
}
export function logicalType(field: string): string {
  return NUMBER_FIELDS.includes(field)
    ? ['series_id', 'ratings_count', 'word_count', 'next_rank'].includes(field)
      ? 'integer'
      : 'numeric'
    : ['rating_updated', 'finished_from', 'finished_to', 'added_at', 'relevance_updated'].includes(
          field,
        )
      ? 'date'
      : ['authors', 'genres'].includes(field)
        ? 'array'
        : 'text';
}
async function attribute(
  client: SqlClient,
  id: string,
  field: string,
  value: Json,
  runId: string,
  source: string,
) {
  await client.query(
    `INSERT INTO library.book_field_provenance(book_id,field_name,origin,source_reference,import_run_id,value_sha256,hash_version) VALUES($1,$2,'unknown',$3,$4,library.value_hash($2,$5,$6::jsonb),'pg-jsonb-text-v1') ON CONFLICT(book_id,field_name) DO UPDATE SET origin='unknown',actor=NULL,provider=NULL,model=NULL,prompt_version=NULL,source_reference=excluded.source_reference,produced_at=NULL,reviewed_by=NULL,reviewed_at=NULL,import_run_id=excluded.import_run_id,value_sha256=excluded.value_sha256,hash_version=excluded.hash_version`,
    [id, field, source, runId, logicalType(field.split('.')[1]), JSON.stringify(value)],
  );
}
async function saveRow(
  client: SqlClient,
  table: 'books' | 'book_feedback' | 'book_assessments',
  id: string,
  values: Record<string, Json>,
  fields: readonly string[],
  change: Change,
  runId: string,
  manifest: SnapshotManifest,
) {
  const before = change.state?.raw[table] ?? {};
  const entries = fields.filter(
    (k) =>
      Object.hasOwn(values, k) && canonicalJson(values[k]) !== canonicalJson(before[k] ?? null),
  );
  if (table !== 'books' && !change.state?.raw[table]?.book_id) {
    if (!entries.length) return;
    await client.query(
      `INSERT INTO library.${table}(book_id,updated_by,last_import_run_id) VALUES($1,session_user,$2)`,
      [id, runId],
    );
  }
  if (!entries.length) return;
  const payload = Object.fromEntries(entries.map((k) => [k, values[k]]));
  // Only closed, compile-time field lists enter SQL identifiers. Values remain parameters.
  const assignments = entries
    .map((k) => `${k}=(jsonb_populate_record(NULL::library.${table},$2::jsonb)).${k}`)
    .join(',');
  const existing = table === 'books' ? !!change.state : !!change.state?.raw[table]?.book_id;
  const reset =
    table === 'book_assessments'
      ? ",review_state='unreviewed',reviewed_by=NULL,reviewed_at=NULL"
      : '';
  await client.query(
    `UPDATE library.${table} SET ${assignments},row_version=row_version+${existing ? 1 : 0},updated_at=now(),updated_by=session_user,last_import_run_id=$3,source_updated_at=coalesce($4::timestamptz,source_updated_at),source_updated_by=coalesce($5::text,source_updated_by)${reset} WHERE ${table === 'books' ? 'id' : 'book_id'}=$1`,
    [
      id,
      JSON.stringify(payload),
      runId,
      change.candidate.sourceMetadata.source_updated_at ?? null,
      change.candidate.sourceMetadata.source_updated_by ?? null,
    ],
  );
  for (const key of entries)
    await attribute(client, id, table + '.' + key, values[key], runId, manifest.sourceKey);
}
export async function applyCore(
  client: SqlClient,
  plan: Plan,
  manifest: SnapshotManifest,
  runId: string,
) {
  await client.query('SELECT id FROM library.books ORDER BY id FOR UPDATE');
  for (const change of plan.changes) {
    const { candidate, writes, state } = change;
    const values = expanded(writes);
    let id = state?.id;
    if (writes.series !== undefined) {
      const s = writes.series as Record<string, Json>;
      values.series_id =
        s.name === null ? null : await lookup(client, 'series', String(s.name), runId);
      values.series_volume = s.series_volume;
      values.series_label_raw = s.series_label_raw;
      if (values.series_id !== null)
        await client.query(
          'UPDATE library.series SET published_count=$2,planned_count=$3,status=$4,checked_at=$5,updated_at=now(),updated_by=session_user,last_import_run_id=$6 WHERE id=$1 AND (published_count,planned_count,status,checked_at) IS DISTINCT FROM ($2::integer,$3::integer,$4::text,$5::date)',
          [values.series_id, s.published_count, s.planned_count, s.status, s.checked_at, runId],
        );
    }
    if (!id) {
      const r = await client.query(
        'INSERT INTO library.books(stable_id,title,platform,status,updated_by,last_import_run_id) VALUES($1,$2,$3,$4,session_user,$5) RETURNING id::text',
        [candidate.stableId, values.title, values.platform, values.status, runId],
      );
      id = r.rows[0].id;
    }
    let linksChanged = false;
    for (const [field, table, joinTable, idColumn] of [
      ['authors', 'authors', 'book_authors', 'author_id'],
      ['genres', 'genres', 'book_genres', 'genre_id'],
    ] as const)
      if (writes[field] !== undefined) {
        const wanted = await Promise.all(
          (writes[field] as string[]).map((n) => lookup(client, table, n, runId)),
        );
        if (field === 'genres') wanted.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
        const old = (
          await client.query(
            `SELECT ${idColumn}::text AS id FROM library.${joinTable} WHERE book_id=$1 ORDER BY ${field === 'authors' ? 'position' : idColumn}`,
            [id],
          )
        ).rows.map((r) => r.id);
        if (canonicalJson(old) !== canonicalJson(wanted)) {
          linksChanged = true;
          await client.query(`DELETE FROM library.${joinTable} WHERE book_id=$1`, [id]);
          for (const [i, target] of wanted.entries())
            await client.query(
              `INSERT INTO library.${joinTable}(book_id,${idColumn}${field === 'authors' ? ',position' : ''}) VALUES($1,$2${field === 'authors' ? ', $3' : ''})`,
              field === 'authors' ? [id, target, i + 1] : [id, target],
            );
          await attribute(client, id!, 'books.' + field, wanted, runId, manifest.sourceKey);
        }
      }
    const scalarChanged = BOOK_FIELDS.some(
      (k) =>
        Object.hasOwn(values, k) &&
        canonicalJson(values[k]) !== canonicalJson(state?.raw.books[k] ?? null),
    );
    await saveRow(client, 'books', id!, values, BOOK_FIELDS, change, runId, manifest);
    if (linksChanged && state && !scalarChanged)
      await client.query(
        'UPDATE library.books SET row_version=row_version+1,updated_at=now(),updated_by=session_user,last_import_run_id=$2 WHERE id=$1',
        [id, runId],
      );
    await saveRow(client, 'book_feedback', id!, values, FEEDBACK_FIELDS, change, runId, manifest);
    await saveRow(
      client,
      'book_assessments',
      id!,
      values,
      ASSESSMENT_FIELDS,
      change,
      runId,
      manifest,
    );
    if (
      !state ||
      linksChanged ||
      scalarChanged ||
      Object.entries(writes).some(
        ([k, v]) =>
          [
            'rating',
            'opinion',
            'opinion_raw',
            'notes',
            'pros',
            'cons',
            'personal_relevance',
            'relevance_reason',
            'relevance_updated',
          ].includes(k) && canonicalJson(v) !== canonicalJson(state?.data[k] ?? null),
      )
    ) {
      if (Object.keys(candidate.sourceMetadata).length)
        await client.query(
          'UPDATE library.books SET source_updated_at=coalesce($2::timestamptz,source_updated_at),source_updated_by=coalesce($3::text,source_updated_by) WHERE id=$1',
          [
            id,
            candidate.sourceMetadata.source_updated_at ?? null,
            candidate.sourceMetadata.source_updated_by ?? null,
          ],
        );
    }
    // Initial required fields were present at INSERT; provenance must cover those too.
    if (!state)
      for (const field of ['title', 'platform', 'status'])
        await attribute(client, id!, 'books.' + field, values[field], runId, manifest.sourceKey);
    for (const [field, value] of Object.entries(change.adopts))
      await client.query(
        `INSERT INTO import_audit.field_baselines(source_key,entity_kind,entity_key,field_name,source_value,source_sha256,accepted_run_id) VALUES($1,'book',$2,$3,$4::jsonb,$5,$6) ON CONFLICT(source_key,entity_kind,entity_key,field_name) DO UPDATE SET source_value=excluded.source_value,source_sha256=excluded.source_sha256,accepted_run_id=excluded.accepted_run_id`,
        [
          manifest.sourceKey,
          candidate.stableId,
          field,
          JSON.stringify(value),
          manifest.sourceSha256,
          runId,
        ],
      );
  }
}
