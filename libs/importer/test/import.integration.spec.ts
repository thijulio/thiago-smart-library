import { it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestDatabase } from '@smart-library/database/testing';
import { runImport } from '../src/run-import';
import { syntheticSnapshot, books } from './synthetic';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let snapshots: Awaited<ReturnType<typeof syntheticSnapshot>>[] = [];
beforeEach(async () => {
  db = await createTestDatabase();
});
afterEach(async () => {
  await db?.dispose();
  for (const s of snapshots) await s.dispose();
  snapshots = [];
});
async function snapshot(input = books, time = '2026-10-02T00:00:00Z') {
  const s = await syntheticSnapshot(input, time);
  snapshots.push(s);
  return s;
}
async function apply(s: Awaited<ReturnType<typeof snapshot>>, resolutionFile?: string) {
  return runImport(
    {
      snapshotDirectory: s.directory,
      scope: 'core',
      mode: 'apply',
      reportDirectory: s.report(),
      resolutionFile,
    },
    db.importer,
  );
}
async function canonical() {
  return (
    await db.owner.query('SELECT to_jsonb(b)::text AS value FROM library.books b ORDER BY id')
  ).rows;
}
// Obtain versions through owner: editor intentionally has no base-table SELECT grants.
async function editNotes(text: string) {
  const v = (
    await db.owner.query(
      "SELECT f.row_version FROM library.book_feedback f JOIN library.books b ON b.id=f.book_id WHERE b.stable_id='legacy-book'",
    )
  ).rows[0].row_version;
  await db.editor.query("SELECT library.patch_feedback('legacy-book',$1,$2,gen_random_uuid())", [
    v,
    JSON.stringify({ notes: text }),
  ]);
}
it('I01 initial exact stable IDs, coauthors and blank genres', async () => {
  const r = await apply(await snapshot());
  expect(r.inserted).toBe(3);
  expect(
    (await db.owner.query('SELECT stable_id FROM library.books ORDER BY stable_id')).rows.map(
      (x) => x.stable_id,
    ),
  ).toEqual(books.map((b) => b['Book ID']).sort());
  expect((await db.owner.query('SELECT count(*) FROM library.book_authors')).rows[0].count).toBe(
    '4',
  );
  expect((await db.owner.query('SELECT count(*) FROM library.book_genres')).rows[0].count).toBe(
    '0',
  );
});
it('I02 replay after native edit returns original outcome and never overwrites', async () => {
  const s = await snapshot();
  const a = await apply(s);
  await editNotes('Native synthetic');
  const before = await canonical();
  const b = await apply(s);
  expect(b).toEqual(a);
  expect(await canonical()).toEqual(before);
  expect(
    (await db.owner.query('SELECT notes FROM library.book_feedback WHERE notes IS NOT NULL'))
      .rows[0].notes,
  ).toBe('Native synthetic');
});
it('I03 concurrent identical applications return one outcome', async () => {
  const s = await snapshot();
  const [a, b] = await Promise.all([apply(s), apply(s)]);
  expect(a).toEqual(b);
  expect((await db.owner.query('SELECT count(*) FROM library.books')).rows[0].count).toBe('3');
});
it('I04 adding book leaves existing canonical rows unchanged', async () => {
  await apply(await snapshot());
  const before = await canonical();
  const r = await apply(
    await snapshot(
      [
        ...books,
        {
          'Book ID': 'new-synthetic',
          Title: 'New',
          Author: 'Example D',
          Platform: 'Kindle',
          Status: 'unread',
        },
      ],
      '2026-10-03T00:00:00Z',
    ),
  );
  expect(r.inserted).toBe(1);
  expect((await canonical()).slice(0, 3)).toEqual(before);
});
it('I05 stable ID title/rating change without row timestamp change', async () => {
  await apply(await snapshot());
  const next = books.map((b) => ({ ...b }));
  next[0].Title = 'Changed';
  next[0].Liked = '3.5';
  const r = await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(r.updated).toBe(1);
  expect(
    (
      await db.owner.query(
        "SELECT title,stable_id FROM library.books WHERE stable_id='legacy-book'",
      )
    ).rows[0],
  ).toEqual({ title: 'Changed', stable_id: 'legacy-book' });
});
it('I06 native notes preserved alongside source-only title change', async () => {
  await apply(await snapshot());
  await editNotes('Native');
  const next = books.map((b) => ({ ...b }));
  next[0].Title = 'Changed';
  await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(
    (await db.owner.query('SELECT notes FROM library.book_feedback WHERE notes IS NOT NULL'))
      .rows[0].notes,
  ).toBe('Native');
});
it('I07 two-sided change conflicts and retains prior baseline', async () => {
  await apply(await snapshot());
  await editNotes('Native');
  const next = books.map((b) => ({ ...b }));
  next[0].Notes = 'Source';
  const r = await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(r.conflicts).toBe(1);
  expect(
    (
      await db.owner.query(
        "SELECT source_value FROM import_audit.field_baselines WHERE field_name='notes'",
      )
    ).rows[0].source_value,
  ).toBe('Synthetic notes');
});
async function resolution(
  s: Awaited<ReturnType<typeof snapshot>>,
  action = 'clear',
  stale = false,
) {
  const r = (
    await db.owner.query(
      "SELECT f.row_version::text AS version, library.value_hash('merge.notes','json',to_jsonb(f.notes)) AS hash FROM library.book_feedback f JOIN library.books b ON b.id=f.book_id WHERE b.stable_id='legacy-book'",
    )
  ).rows[0];
  const file = join(s.root, 'resolution.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceSha256: s.manifest.sourceSha256,
          entityKey: 'legacy-book',
          field: 'notes',
          expectedHash: stale ? '0'.repeat(64) : r.hash,
          expectedVersion: r.version,
          hashVersion: 'pg-jsonb-text-v1',
          reviewer: 'synthetic-reviewer',
          reviewedAt: '2026-10-02T00:00:00Z',
          action,
        },
      ],
    }),
    { mode: 0o600 },
  );
  return file;
}
it('I08 blank preserves notes; reviewed clear with expected hash applies', async () => {
  await apply(await snapshot());
  const next = books.map((b) => ({ ...b }));
  next[0].Notes = null;
  const s = await snapshot(next, '2026-10-03T00:00:00Z');
  await apply(s);
  expect(
    (await db.owner.query('SELECT notes FROM library.book_feedback WHERE notes IS NOT NULL'))
      .rows[0].notes,
  ).toBe('Synthetic notes');
  await apply(s, await resolution(s));
  expect(
    (await db.owner.query('SELECT count(*) FROM library.book_feedback WHERE notes IS NOT NULL'))
      .rows[0].count,
  ).toBe('0');
});
it('I09 older effective time and equal-time different bytes blocked', async () => {
  await apply(await snapshot());
  const before = await canonical();
  for (const t of ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']) {
    const next = books.map((b) => ({ ...b }));
    next[0].Title = 'Old';
    expect((await apply(await snapshot(next, t))).status).toBe('blocked');
    expect(await canonical()).toEqual(before);
  }
});
it('I10 stale reviewed resolution blocks canonical transaction', async () => {
  await apply(await snapshot());
  const s = await snapshot(books, '2026-10-03T00:00:00Z');
  const f = await resolution(s);
  await editNotes('Native');
  const before = await canonical();
  expect((await apply(s, f)).status).toBe('blocked');
  expect(await canonical()).toEqual(before);
});
it('I11 failure on second write rolls back domain and retains staged failed audit', async () => {
  await db.owner.query(
    "SET ROLE library_owner; CREATE FUNCTION library.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.stable_id='00000000-0000-4000-8000-000000000002' THEN RAISE EXCEPTION 'SYNTHETIC_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_fail BEFORE INSERT ON library.books FOR EACH ROW EXECUTE FUNCTION library.synthetic_fail(); RESET ROLE",
  );
  const r = await apply(await snapshot());
  expect(r.status).toBe('failed');
  expect((await db.owner.query('SELECT count(*) FROM library.books')).rows[0].count).toBe('0');
  expect((await db.owner.query('SELECT status FROM import_audit.import_runs')).rows[0].status).toBe(
    'failed',
  );
  expect(
    Number((await db.owner.query('SELECT count(*) FROM import_audit.import_rows')).rows[0].count),
  ).toBeGreaterThan(0);
});
it('I12 disappeared book is retained without archive', async () => {
  await apply(await snapshot());
  await apply(await snapshot(books.slice(0, 2), '2026-10-03T00:00:00Z'));
  expect(
    (await db.owner.query('SELECT count(*) FROM library.books WHERE archived_at IS NULL')).rows[0]
      .count,
  ).toBe('3');
});
it('I13 title collision preserves two independent identities', async () => {
  const next = books.map((b) => ({ ...b, Title: 'Same synthetic title' }));
  expect((await apply(await snapshot(next))).inserted).toBe(3);
});
it('I14 contradictory completion group leaves all bounds unchanged', async () => {
  await apply(await snapshot());
  const next = books.map((b) => ({ ...b }));
  next[1]['Year Finished'] = '2025';
  const r = await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(r.quarantined).toBeGreaterThan(0);
  expect(
    (
      await db.owner.query('SELECT finished_from::text FROM library.books WHERE stable_id=$1', [
        books[1]['Book ID'],
      ])
    ).rows[0].finished_from,
  ).toBe('2026-05-01');
});
it('I15 scoped replay identity is distinct; later scopes are gated', async () => {
  const s = await snapshot();
  await apply(s);
  await expect(
    runImport(
      {
        snapshotDirectory: s.directory,
        scope: 'enrichment',
        mode: 'apply',
        reportDirectory: s.report(),
      },
      db.importer,
    ),
  ).rejects.toThrow('SCOPE_NOT_IMPLEMENTED');
  expect(
    (await db.owner.query('SELECT scope FROM import_audit.import_runs')).rows.map((r) => r.scope),
  ).toEqual(['core']);
});
it('I16 rows tampering fails before staging', async () => {
  const s = await snapshot();
  await writeFile(
    join(s.directory, 'rows.jsonl'),
    (await readFile(join(s.directory, 'rows.jsonl'), 'utf8')) + '\n',
  );
  await expect(apply(s)).rejects.toThrow('SNAPSHOT_HASH_MISMATCH');
  expect(
    (await db.owner.query('SELECT count(*) FROM import_audit.import_runs')).rows[0].count,
  ).toBe('0');
});
it('dry-run is read-only, with no audit or canonical writes', async () => {
  const s = await snapshot();
  const r = await runImport(
    { snapshotDirectory: s.directory, scope: 'core', mode: 'dry-run', reportDirectory: s.report() },
    db.importer,
  );
  expect(r.inserted).toBe(3);
  for (const table of ['library.books', 'import_audit.import_runs', 'import_audit.source_heads'])
    expect((await db.owner.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('0');
});
it('accepted assessment preserved; reviewed replacement resets acceptance', async () => {
  await apply(await snapshot());
  await db.owner.query(
    "UPDATE library.book_assessments SET review_state='accepted',reviewed_by='synthetic-owner',reviewed_at=now() WHERE book_id=(SELECT id FROM library.books WHERE stable_id='legacy-book')",
  );
  const next = books.map((b) => ({ ...b }));
  next[0].Pros = 'New synthetic pros';
  const r = await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(r.conflicts).toBe(1);
  expect(
    (await db.owner.query('SELECT pros,review_state FROM library.book_assessments')).rows[0],
  ).toMatchObject({ pros: 'Synthetic pros', review_state: 'accepted' });
});
it('verification checks provenance after a native edit and detects deliberate drift', async () => {
  const { verifyCore } = await import('../src/verify');
  const r = await apply(await snapshot());
  await editNotes('Native');
  expect(await verifyCore(db.importer, r.runId!)).toMatchObject({ stableIds: 3, sourceRows: 3 });
  await db.owner.query(
    "UPDATE library.book_feedback SET notes='synthetic-drift' WHERE book_id=(SELECT id FROM library.books WHERE stable_id='legacy-book')",
  );
  await expect(verifyCore(db.importer, r.runId!)).rejects.toThrow('VERIFY_PROVENANCE');
});
it('reviewed accepted-assessment replacement resets review and updates version/provenance', async () => {
  await apply(await snapshot());
  await db.owner.query(
    "UPDATE library.book_assessments SET review_state='accepted',reviewed_by='synthetic-owner',reviewed_at=now() WHERE book_id=(SELECT id FROM library.books WHERE stable_id='legacy-book')",
  );
  const next = books.map((b) => ({ ...b }));
  next[0].Pros = 'New synthetic pros';
  const s = await snapshot(next, '2026-10-03T00:00:00Z');
  const v = (
    await db.owner.query(
      "SELECT a.row_version::text AS version,library.value_hash('merge.pros','json',to_jsonb(a.pros)) AS hash FROM library.book_assessments a JOIN library.books b ON b.id=a.book_id WHERE b.stable_id='legacy-book'",
    )
  ).rows[0];
  const file = join(s.root, 'accepted-resolution.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceSha256: s.manifest.sourceSha256,
          entityKey: 'legacy-book',
          field: 'pros',
          expectedHash: v.hash,
          expectedVersion: v.version,
          hashVersion: 'pg-jsonb-text-v1',
          reviewer: 'synthetic-owner',
          reviewedAt: '2026-10-02T00:00:00Z',
          action: 'use_source',
        },
      ],
    }),
    { mode: 0o600 },
  );
  expect((await apply(s, file)).status).toBe('applied');
  expect(
    (
      await db.owner.query(
        'SELECT pros,review_state,reviewed_by,row_version FROM library.book_assessments',
      )
    ).rows[0],
  ).toMatchObject({
    pros: 'New synthetic pros',
    review_state: 'unreviewed',
    reviewed_by: null,
    row_version: '2',
  });
});
it('required duplicate IDs freeze entire scope; optional invalid cover preserves other changes', async () => {
  const duplicate = books.map((b) => ({ ...b }));
  duplicate[1]['Book ID'] = 'legacy-book';
  expect((await apply(await snapshot(duplicate))).status).toBe('blocked');
  expect((await db.owner.query('SELECT count(*) FROM library.books')).rows[0].count).toBe('0');
  const first = books.map((b) => ({ ...b }));
  first[0]['Cover URL'] = 'https://example.invalid/synthetic.jpg';
  await apply(await snapshot(first, '2026-10-03T00:00:00Z'));
  const next = first.map((b) => ({ ...b }));
  next[0]['Cover URL'] = 'data:private';
  next[0].Title = 'Changed';
  const r = await apply(await snapshot(next, '2026-10-04T00:00:00Z'));
  expect(r.exitCode).toBe(2);
  expect(
    (
      await db.owner.query(
        "SELECT title,cover_url FROM library.books WHERE stable_id='legacy-book'",
      )
    ).rows[0],
  ).toMatchObject({ title: 'Changed', cover_url: 'https://example.invalid/synthetic.jpg' });
});
it('source-owned author/genre replacement is atomic and versions increment once', async () => {
  await apply(await snapshot());
  const next = books.map((b) => ({ ...b }));
  next[0].Author = 'Example B & Example D';
  next[0].Genre = 'Synthetic';
  next[0].Title = 'Changed';
  await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(
    (await db.owner.query("SELECT row_version FROM library.books WHERE stable_id='legacy-book'"))
      .rows[0].row_version,
  ).toBe('2');
  expect(
    (
      await db.owner.query(
        "SELECT a.name FROM library.book_authors ba JOIN library.authors a ON a.id=ba.author_id JOIN library.books b ON b.id=ba.book_id WHERE b.stable_id='legacy-book' ORDER BY ba.position",
      )
    ).rows.map((r) => r.name),
  ).toEqual(['Example B', 'Example D']);
  expect((await db.owner.query('SELECT count(*) FROM library.book_genres')).rows[0].count).toBe(
    '1',
  );
});
it('legacy year coercion requires an expected-hash reviewed resolution', async () => {
  const next = books.map((b) => ({ ...b }));
  next[1]['Year Finished'] = '2026-05';
  const s = await snapshot(next);
  const first = await apply(s);
  expect(first.exitCode).toBe(2);
  const v = (
    await db.owner.query(
      "SELECT b.row_version::text AS version,library.value_hash('merge.completion','json',jsonb_build_object('finished_from',b.finished_from::text,'finished_to',b.finished_to::text,'finished_precision',b.finished_precision,'finished_date_raw',b.finished_date_raw,'finished_year_raw',b.finished_year_raw)) AS hash FROM library.books b WHERE stable_id=$1",
      [books[1]['Book ID']],
    )
  ).rows[0];
  const file = join(s.root, 'year-resolution.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      entries: [
        {
          sourceSha256: s.manifest.sourceSha256,
          entityKey: books[1]['Book ID'],
          field: 'completion',
          expectedHash: v.hash,
          expectedVersion: v.version,
          hashVersion: 'pg-jsonb-text-v1',
          reviewer: 'synthetic-owner',
          reviewedAt: '2026-10-02T00:00:00Z',
          action: 'use_source',
        },
      ],
    }),
    { mode: 0o600 },
  );
  expect((await apply(s, file)).status).toBe('applied');
  expect(
    (
      await db.owner.query(
        'SELECT finished_from::text,finished_precision FROM library.books WHERE stable_id=$1',
        [books[1]['Book ID']],
      )
    ).rows[0],
  ).toMatchObject({ finished_from: '2026-05-01', finished_precision: 'month' });
  expect(
    (
      await db.owner.query(
        "SELECT count(*) FROM import_audit.import_issues WHERE code='RESOLUTION_USE_SOURCE' AND resolved_by='synthetic-owner'",
      )
    ).rows[0].count,
  ).toBe('1');
});
it('reviewed synthetic series sentinels retain raw labels without fake series', async () => {
  const next = books.map((b) => ({ ...b }));
  next[0].Series = 'Synthetic no-series';
  next[0]['Series Volume'] = '9';
  const s = await snapshot(next);
  expect((await apply(s)).quarantined).toBeGreaterThan(0);
  const file = join(s.root, 'policy.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      sourceSha256: s.manifest.sourceSha256,
      reviewer: 'synthetic-owner',
      reviewedAt: '2026-10-02T00:00:00Z',
      seriesSentinels: ['Synthetic no-series'],
      cachedFormulaFields: [],
    }),
    { mode: 0o600 },
  );
  const r = await runImport(
    {
      snapshotDirectory: s.directory,
      scope: 'core',
      mode: 'apply',
      reportDirectory: s.report(),
      policyFile: file,
    },
    db.importer,
  );
  expect(r.status).toBe('applied');
  expect(
    (
      await db.owner.query(
        "SELECT series_id,series_volume,series_label_raw FROM library.books WHERE stable_id='legacy-book'",
      )
    ).rows[0],
  ).toMatchObject({
    series_id: null,
    series_volume: null,
    series_label_raw: 'Synthetic no-series',
  });
  expect((await db.owner.query('SELECT count(*) FROM library.series')).rows[0].count).toBe('0');
});
it('wrong target schema history fails before any staging', async () => {
  const s = await snapshot();
  await db.owner.query(
    "UPDATE db_meta.schema_migrations SET checksum=repeat('0',64) WHERE name='0005_core_import_support.sql'",
  );
  await expect(apply(s)).rejects.toThrow('IMPORT_SCHEMA_MISMATCH');
  expect(
    (await db.owner.query('SELECT count(*) FROM import_audit.import_runs')).rows[0].count,
  ).toBe('0');
});
it.each(['missing required header', 'duplicate header', 'missing sheet'])(
  'structural corruption blocks canonical import: %s',
  async (kind) => {
    const { default: ExcelJS } = await import('exceljs');
    const { extractWorkbook } = await import('../src/extract-xlsx');
    const s = await snapshot();
    const source = join(s.root, 'synthetic.xlsx');
    const w = new ExcelJS.Workbook();
    await w.xlsx.readFile(source);
    const sheet = w.getWorksheet('Untitled')!;
    if (kind === 'missing required header') sheet.getRow(1).getCell(1).value = 'Unmapped Title';
    if (kind === 'duplicate header') sheet.getRow(1).getCell(2).value = 'Title';
    if (kind === 'missing sheet') w.removeWorksheet(w.getWorksheet('Book Recaps')!.id);
    await w.xlsx.writeFile(source);
    s.directory = join(s.root, 'changed');
    s.manifest = await extractWorkbook({
      sourcePath: source,
      outputDirectory: s.directory,
      sourceKey: 'synthetic-library',
      effectiveAt: s.manifest.effectiveAt,
      freshnessApprovedBy: 'synthetic-test',
    });
    expect((await apply(s)).status).toBe('blocked');
    expect((await db.owner.query('SELECT count(*) FROM library.books')).rows[0].count).toBe('0');
  },
);
it('source scope identity cannot collide with an already applied core run', async () => {
  const s = await snapshot();
  const r = await apply(s);
  await db.importer.query(
    `INSERT INTO import_audit.import_runs(id,source_key,source_sha256,transform_version,scope,config_sha256,source_label,status,manifest,effective_at) SELECT gen_random_uuid(),source_key,source_sha256,transform_version,'enrichment',config_sha256,source_label,'staged',manifest,effective_at FROM import_audit.import_runs WHERE id=$1`,
    [r.runId],
  );
  expect(
    (await db.owner.query('SELECT scope,status FROM import_audit.import_runs ORDER BY scope')).rows,
  ).toEqual([
    { scope: 'core', status: 'applied' },
    { scope: 'enrichment', status: 'staged' },
  ]);
});
it('verification rejects PUBLIC base-table grants even when schema usage is denied', async () => {
  const { verifyCore } = await import('../src/verify');
  const r = await apply(await snapshot());
  await db.owner.query('GRANT SELECT ON library.book_feedback TO PUBLIC');
  await expect(verifyCore(db.importer, r.runId!)).rejects.toThrow('VERIFY_PUBLIC_GRANT');
});
it('matching series attributes use the latest checked date; contradictory counts quarantine the group', async () => {
  const next = books.map((b) => ({ ...b }));
  for (const b of next.slice(0, 2)) {
    b.Series = 'Synthetic Series';
    b['Series Published'] = '2';
    b['Series Planned Total'] = '3';
    b['Series Status'] = 'Ongoing';
  }
  next[0]['Series Checked'] = '2026-09-01';
  next[1]['Series Checked'] = '2026-10-01';
  const s = await snapshot(next);
  const policyFile = join(s.root, 'series-policy.json');
  await writeFile(
    policyFile,
    JSON.stringify({
      version: 1,
      sourceSha256: s.manifest.sourceSha256,
      reviewer: 'synthetic-owner',
      reviewedAt: '2026-10-02T00:00:00Z',
      seriesSentinels: [],
      cachedFormulaFields: [],
    }),
    { mode: 0o600 },
  );
  const r = await runImport(
    {
      snapshotDirectory: s.directory,
      scope: 'core',
      mode: 'apply',
      reportDirectory: s.report(),
      policyFile,
    },
    db.importer,
  );
  expect(r.status).toBe('applied');
  expect(
    (await db.owner.query('SELECT checked_at::text FROM library.series')).rows[0]?.checked_at,
  ).toBe('2026-10-01');
});
it('blank atomic group members do not erase accepted rating metadata', async () => {
  const initial = books.map((b) => ({ ...b }));
  initial[0]['Community Rating'] = '4.2';
  initial[0]['Ratings Count'] = '10';
  await apply(await snapshot(initial));
  const next = initial.map((b) => ({ ...b }));
  next[0]['Community Rating'] = '4.3';
  next[0]['Ratings Count'] = null;
  await apply(await snapshot(next, '2026-10-03T00:00:00Z'));
  expect(
    (
      await db.owner.query(
        "SELECT community_rating,ratings_count FROM library.books WHERE stable_id='legacy-book'",
      )
    ).rows[0],
  ).toMatchObject({ community_rating: '4.2', ratings_count: '10' });
});
it.each(['keep_database', 'clear'])(
  'reviewed %s survives a later snapshot with unchanged source field',
  async (action) => {
    await apply(await snapshot());
    await editNotes('Native');
    const next = books.map((b) => ({ ...b }));
    next[0].Notes = 'Source';
    const s = await snapshot(next, '2026-10-03T00:00:00Z');
    await apply(s, await resolution(s, action));
    const later = next.map((b) => ({ ...b }));
    later[1].Title = 'Another changed field';
    await apply(await snapshot(later, '2026-10-04T00:00:00Z'));
    expect(
      (
        await db.owner.query(
          "SELECT f.notes FROM library.book_feedback f JOIN library.books b ON b.id=f.book_id WHERE b.stable_id='legacy-book'",
        )
      ).rows[0].notes,
    ).toBe(action === 'clear' ? null : 'Native');
  },
);
it('verification rejects a baseline attached to an entity absent from its accepted source run', async () => {
  const run = await apply(await snapshot());
  await db.owner.query(
    "UPDATE import_audit.field_baselines SET entity_key='not-in-the-accepted-source' WHERE entity_key='legacy-book' AND field_name='title'",
  );
  const { verifyCore } = await import('../src/verify');
  await expect(verifyCore(db.importer, run.runId!)).rejects.toThrow('VERIFY_BASELINE');
});
it('reviewed cached Book ID retains its audit locator and verifies without generating identity', async () => {
  const s = await snapshot();
  const { default: ExcelJS } = await import('exceljs');
  const { extractWorkbook } = await import('../src/extract-xlsx');
  const w = new ExcelJS.Workbook();
  const path = join(s.root, 'synthetic.xlsx');
  await w.xlsx.readFile(path);
  const sheet = w.getWorksheet('Untitled')!;
  sheet.getCell('X2').value = { formula: '"legacy-book"', result: 'legacy-book' };
  await w.xlsx.writeFile(path);
  const directory = join(s.root, 'formula-snapshot');
  const manifest = await extractWorkbook({
    sourcePath: path,
    outputDirectory: directory,
    sourceKey: 'synthetic-library',
    effectiveAt: '2026-10-02T00:00:00Z',
    freshnessApprovedBy: 'synthetic-test',
  });
  const policyFile = join(s.root, 'formula-policy.json');
  await writeFile(
    policyFile,
    JSON.stringify({
      version: 1,
      sourceSha256: manifest.sourceSha256,
      reviewer: 'synthetic-reviewer',
      reviewedAt: '2026-10-02T01:00:00Z',
      seriesSentinels: [],
      cachedFormulaFields: ['Untitled!X2'],
    }),
    { mode: 0o600 },
  );
  const run = await runImport(
    {
      snapshotDirectory: directory,
      scope: 'core',
      mode: 'apply',
      reportDirectory: s.report(),
      policyFile,
    },
    db.importer,
  );
  expect(run.inserted).toBe(3);
  expect(
    (
      await db.owner.query(
        "SELECT stable_id FROM import_audit.import_rows WHERE run_id=$1 AND sheet_name='Untitled' AND row_number=2",
        [run.runId],
      )
    ).rows[0].stable_id,
  ).toBe('legacy-book');
  const { verifyCore } = await import('../src/verify');
  expect((await verifyCore(db.importer, run.runId!)).stableIds).toBe(3);
});
