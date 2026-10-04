import type { Pool } from 'pg';
import { withTransaction } from '@smart-library/database';
import { assertImportTarget } from './target-schema';
import { logicalType } from './apply-core';
import { NUMBER_FIELDS } from './plan-import';
import { GROUP_FIELDS } from './resolutions';
import { canonicalJson, sha256Utf8 } from './canonical-json';
import type { Json } from './contracts';
export async function verifyCore(db: Pool, runId: string) {
  await assertImportTarget(db);
  return withTransaction(db, async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const run = (
      await client.query(
        "SELECT * FROM import_audit.import_runs WHERE id=$1 AND scope='core' AND status='applied'",
        [runId],
      )
    ).rows[0];
    if (!run) throw new Error('RUN_NOT_APPLIED');
    const sourceRows = (
      await client.query(
        'SELECT sheet_name,row_number,cells,row_sha256,stable_id FROM import_audit.import_rows WHERE run_id=$1 AND row_number>1 ORDER BY sheet_name,row_number',
        [runId],
      )
    ).rows;
    const sourceIds = sourceRows
      .filter(
        (r) =>
          r.cells.some((c: { header: string }) => c.header === 'Title') && r.stable_id !== null,
      )
      .map((r) => r.stable_id);
    const actualIds = (
      await client.query('SELECT stable_id FROM library.books ORDER BY stable_id')
    ).rows.map((r) => r.stable_id);
    if (
      sourceIds.some((id) => !actualIds.includes(id)) ||
      new Set(actualIds).size !== actualIds.length
    )
      throw new Error('VERIFY_IDENTITY');
    for (const sheet of run.manifest.sheets)
      if (sourceRows.filter((r) => r.sheet_name === sheet.name).length !== sheet.populatedRows)
        throw new Error('VERIFY_ROW_COUNT');
    for (const r of sourceRows)
      if (
        sha256Utf8(canonicalJson({ sheet: r.sheet_name, row: r.row_number, cells: r.cells })) !==
        r.row_sha256
      )
        throw new Error('VERIFY_ROW_HASH');
    if (
      Number(
        (
          await client.query(
            'SELECT count(*) FROM library.books b WHERE NOT EXISTS(SELECT 1 FROM library.book_authors a WHERE a.book_id=b.id)',
          )
        ).rows[0].count,
      )
    )
      throw new Error('VERIFY_AUTHORS');
    if (
      Number(
        (
          await client.query(
            'SELECT count(*) FROM library.book_authors ba LEFT JOIN library.books b ON b.id=ba.book_id LEFT JOIN library.authors a ON a.id=ba.author_id WHERE b.id IS NULL OR a.id IS NULL',
          )
        ).rows[0].count,
      ) +
      Number(
        (
          await client.query(
            'SELECT count(*) FROM library.book_genres bg LEFT JOIN library.books b ON b.id=bg.book_id LEFT JOIN library.genres g ON g.id=bg.genre_id WHERE b.id IS NULL OR g.id IS NULL',
          )
        ).rows[0].count,
      )
    )
      throw new Error('VERIFY_ORPHANS');
    const provenance = (
      await client.query(
        'SELECT p.*,to_jsonb(b) AS books,to_jsonb(f) AS book_feedback,to_jsonb(a) AS book_assessments FROM library.book_field_provenance p JOIN library.books b ON b.id=p.book_id LEFT JOIN library.book_feedback f ON f.book_id=b.id LEFT JOIN library.book_assessments a ON a.book_id=b.id',
      )
    ).rows;
    for (const p of provenance) {
      const [table, field] = p.field_name.split('.');
      let value: Json;
      if (['authors', 'genres'].includes(field)) {
        const t = field === 'authors' ? 'book_authors' : 'book_genres',
          c = field === 'authors' ? 'author_id' : 'genre_id';
        value = (
          await client.query(
            `SELECT ${c}::text AS id FROM library.${t} WHERE book_id=$1 ORDER BY ${field === 'authors' ? 'position' : c}`,
            [p.book_id],
          )
        ).rows.map((r) => r.id);
      } else if (NUMBER_FIELDS.includes(field)) {
        // Fetch strings in SQL; never hash a bigint rounded by a JavaScript JSON decoder.
        const qualified = table === 'books' ? 'id' : 'book_id';
        value =
          (
            await client.query(
              `SELECT ${field}::text AS value FROM library.${table} WHERE ${qualified}=$1`,
              [p.book_id],
            )
          ).rows[0]?.value ?? null;
        if (logicalType(field) === 'numeric' && typeof value === 'string')
          value = value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      } else value = p[table]?.[field] ?? null;
      const hash = (
        await client.query('SELECT library.value_hash($1,$2,$3::jsonb) AS hash', [
          p.field_name,
          logicalType(field),
          JSON.stringify(value),
        ])
      ).rows[0].hash;
      if (p.hash_version !== 'pg-jsonb-text-v1' || hash !== p.value_sha256)
        throw new Error('VERIFY_PROVENANCE');
    }
    if (
      Number(
        (
          await client.query(
            "SELECT count(*) FROM import_audit.field_baselines f LEFT JOIN import_audit.import_runs r ON r.id=f.accepted_run_id WHERE r.id IS NULL OR r.status<>'applied' OR r.source_sha256<>f.source_sha256 OR r.source_key<>f.source_key OR (f.entity_kind='book' AND (NOT(f.field_name=ANY($1::text[])) OR NOT EXISTS(SELECT 1 FROM import_audit.import_rows ir WHERE ir.run_id=f.accepted_run_id AND ir.sheet_name='Untitled' AND ir.stable_id=f.entity_key)))",
            [GROUP_FIELDS],
          )
        ).rows[0].count,
      )
    )
      throw new Error('VERIFY_BASELINE');
    if (
      Number(
        (
          await client.query(
            "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname IN ('library','import_audit','db_meta') AND c.relkind IN ('r','v','m','p') AND a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='library_public_reader'))",
          )
        ).rows[0].count,
      )
    )
      throw new Error('VERIFY_PUBLIC_GRANT');
    const canonical: Record<string, Json> = {};
    for (const table of [
      'books',
      'authors',
      'genres',
      'series',
      'book_authors',
      'book_genres',
      'book_feedback',
      'book_assessments',
      'book_field_provenance',
    ])
      canonical[table] = (
        await client.query(
          `SELECT to_jsonb(t)::text AS value FROM library.${table} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows.map((r) => r.value);
    return {
      runId,
      stableIds: actualIds.length,
      sourceRows: sourceRows.length,
      provenanceFields: provenance.length,
      canonicalSha256: sha256Utf8(canonicalJson(canonical)),
    };
  });
}
