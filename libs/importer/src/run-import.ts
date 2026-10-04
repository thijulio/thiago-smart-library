import { readPolicy, isReviewedEmptyRow } from './import-policy';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { withTransaction } from '@smart-library/database';
import { assertImportTarget, type ImportTarget } from './target-schema';
import { verifySnapshot } from './manifest';
import { readResolutions } from './resolutions';
import { planImport } from './plan-import';
import { normalizeBook } from './normalize-book';
import { applyCore } from './apply-core';
import { canonicalJson, sha256Utf8 } from './canonical-json';
import { privateOutput, privateWrite } from './private-files';
import type { ImportReport, ImportScope, Json } from './contracts';
const TRANSFORM = 'core-import-v1';
export async function runImport(
  input: {
    snapshotDirectory: string;
    scope: ImportScope;
    mode: 'dry-run' | 'apply';
    resolutionFile?: string;
    policyFile?: string;
    reportDirectory: string;
    target?: ImportTarget;
  },
  db: Pool,
): Promise<ImportReport> {
  if (input.scope !== 'core') throw new Error('SCOPE_NOT_IMPLEMENTED');
  if (!['dry-run', 'apply'].includes(input.mode)) throw new Error('INVALID_MODE');
  const { manifest, rows } = await verifySnapshot(input.snapshotDirectory);
  const resolutions = await readResolutions(input.resolutionFile);
  const policy = await readPolicy(input.policyFile, manifest.sourceSha256, rows);
  const output = await privateOutput(input.reportDirectory);
  const schema = await assertImportTarget(db, input.target);
  const config = sha256Utf8(
    canonicalJson({
      extractor: manifest.extractorVersion,
      aliases: 'reviewed-alias-map-v1',
      schema: schema as unknown as Json,
      parser: 'normalize-v2',
      merge: 'three-way-v2',
      resolutions: resolutions as unknown as Json,
      policy: (policy ?? null) as unknown as Json,
    }),
  );

  const key = [manifest.sourceKey, manifest.sourceSha256, TRANSFORM, input.scope, config];
  let result: ImportReport;
  if (input.mode === 'dry-run') {
    result = await withTransaction(db, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return (await planImport(client, manifest, rows, resolutions, null, policy)).report;
    });
  } else {
    // Commit raw staging before the canonical transaction. Concurrent attempts share this replay key.
    const staged = await withTransaction(db, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(73421,2)');
      const prior = (
        await client.query(
          'SELECT id,status,result FROM import_audit.import_runs WHERE source_key=$1 AND source_sha256=$2 AND transform_version=$3 AND scope=$4 AND config_sha256=$5',
          key,
        )
      ).rows[0];
      if (prior) return prior;
      const id = randomUUID();
      await client.query(
        `INSERT INTO import_audit.import_runs(id,source_key,source_sha256,transform_version,scope,config_sha256,source_label,status,manifest,effective_at) VALUES($1,$2,$3,$4,$5,$6,$2,'staged',$7,$8)`,
        [
          id,
          ...key,
          JSON.stringify({
            ...manifest,
            importConfiguration: { resolutions, policy: policy ?? null },
          }),
          manifest.effectiveAt,
        ],
      );
      for (const row of rows)
        await client.query(
          'INSERT INTO import_audit.import_rows(run_id,sheet_name,row_number,cells,row_sha256,stable_id) VALUES($1,$2,$3,$4,$5,$6)',
          [
            id,
            row.sheet,
            row.row,
            JSON.stringify(row.cells),
            sha256Utf8(canonicalJson(row as unknown as Json)),
            row.sheet === 'Untitled'
              ? normalizeBook(row, manifest, policy).stableId || null
              : (row.cells.find((c) => c.header === 'Book ID' && typeof c.value === 'string')
                  ?.value ?? null),
          ],
        );
      for (const row of rows.filter(
        (r) =>
          r.cells.some((c) => c.header === 'Title') &&
          r.cells.some((c) => c.header === 'Platform') &&
          !isReviewedEmptyRow(r, policy),
      ))
        for (const issue of normalizeBook(row, manifest, policy).issues)
          await client.query(
            `INSERT INTO import_audit.import_issues(run_id,sheet_name,row_number,field_name,code,severity,resolution_state) VALUES($1,$2,$3,$4,$5,$6,'open')`,
            [id, issue.sheet, issue.row, issue.field, issue.code, issue.severity],
          );
      return { id, status: 'staged', result: null };
    });
    if (staged.status === 'applied') result = staged.result;
    else
      try {
        result = await withTransaction(db, async (client) => {
          await client.query("SET LOCAL statement_timeout='120s'");
          await client.query('SELECT pg_advisory_xact_lock(73421,2)');
          const run = (
            await client.query(
              'SELECT status,result FROM import_audit.import_runs WHERE id=$1 FOR UPDATE',
              [staged.id],
            )
          ).rows[0];
          if (run.status === 'applied') return run.result as ImportReport;
          const plan = await planImport(client, manifest, rows, resolutions, staged.id, policy);
          // Header diagnostics use row 1; create an explicit audit header locator, preserving original rows.
          for (const issue of plan.report.issues) {
            await client.query(
              `INSERT INTO import_audit.import_rows(run_id,sheet_name,row_number,cells,row_sha256) VALUES($1,$2,$3,'[]',$4) ON CONFLICT DO NOTHING`,
              [staged.id, issue.sheet, issue.row, sha256Utf8('[]')],
            );
            await client.query(
              `INSERT INTO import_audit.import_issues(run_id,sheet_name,row_number,field_name,code,severity,resolution_state) SELECT $1,$2,$3,$4,$5,$6,'open' WHERE NOT EXISTS(SELECT 1 FROM import_audit.import_issues WHERE run_id=$1 AND sheet_name=$2 AND row_number=$3 AND field_name=$4 AND code=$5)`,
              [staged.id, issue.sheet, issue.row, issue.field, issue.code, issue.severity],
            );
          }
          if (plan.report.exitCode === 3) {
            await client.query(
              "UPDATE import_audit.import_runs SET status='failed',result=$2,completed_at=now() WHERE id=$1",
              [staged.id, JSON.stringify(plan.report)],
            );
            return plan.report;
          }
          for (const entry of resolutions) {
            const candidate = plan.changes.find(
              (c) => c.candidate.stableId === entry.entityKey,
            )?.candidate;
            if (candidate) {
              await client.query(
                `INSERT INTO import_audit.import_issues(run_id,sheet_name,row_number,field_name,code,severity,resolution_state,resolution_note,resolved_by,resolved_at) SELECT $1,$2,$3,$4,$5,'warning','accepted',$6,$7,$8 WHERE NOT EXISTS(SELECT 1 FROM import_audit.import_issues WHERE run_id=$1 AND sheet_name=$2 AND row_number=$3 AND field_name=$4 AND code=$5)`,
                [
                  staged.id,
                  candidate.row.sheet,
                  candidate.row.row,
                  entry.field,
                  'RESOLUTION_' + entry.action.toUpperCase(),
                  entry.action,
                  entry.reviewer,
                  entry.reviewedAt,
                ],
              );
              if (entry.field === 'completion' && entry.action === 'use_source')
                await client.query(
                  "UPDATE import_audit.import_issues SET resolution_state='accepted',resolution_note=$4,resolved_by=$5,resolved_at=$6 WHERE run_id=$1 AND sheet_name=$2 AND row_number=$3 AND code='YEAR_CELL_COERCION'",
                  [
                    staged.id,
                    candidate.row.sheet,
                    candidate.row.row,
                    'reviewed completion conversion',
                    entry.reviewer,
                    entry.reviewedAt,
                  ],
                );
            }
          }
          await applyCore(client, plan, manifest, staged.id);
          plan.report.status = 'applied';
          await client.query(
            'INSERT INTO import_audit.source_heads(source_key,effective_at,source_sha256) VALUES($1,$2,$3) ON CONFLICT(source_key) DO UPDATE SET effective_at=excluded.effective_at,source_sha256=excluded.source_sha256',
            [manifest.sourceKey, manifest.effectiveAt, manifest.sourceSha256],
          );
          await client.query(
            "UPDATE import_audit.import_runs SET status='applied',completed_at=now(),result=$2 WHERE id=$1",
            [staged.id, JSON.stringify(plan.report)],
          );
          return plan.report;
        });
      } catch (error) {
        // Do not overwrite another attempt's committed outcome after a concurrent failure.
        result = await withTransaction(db, async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(73421,2)');
          const run = (
            await client.query(
              'SELECT status,result FROM import_audit.import_runs WHERE id=$1 FOR UPDATE',
              [staged.id],
            )
          ).rows[0];
          if (run.status === 'applied') return run.result as ImportReport;
          const failure: ImportReport = {
            runId: staged.id,
            scope: input.scope,
            sourceSha256: manifest.sourceSha256,
            status: 'failed',
            inserted: 0,
            updated: 0,
            unchanged: 0,
            quarantined: 0,
            conflicts: 0,
            issues: [],
            pendingScopes: ['enrichment', 'events'],
            exitCode: 4,
          };
          const anchor = rows[0] ?? { sheet: 'Library', row: 1 };
          const state = (error as { code?: string }).code;
          const code =
            'TRANSACTION_FAILED' + (state && /^[0-9A-Z]{5}$/.test(state) ? '_' + state : '');
          await client.query(
            `INSERT INTO import_audit.import_rows(run_id,sheet_name,row_number,cells,row_sha256) VALUES($1,$2,$3,'[]',$4) ON CONFLICT DO NOTHING`,
            [staged.id, anchor.sheet, anchor.row, sha256Utf8('[]')],
          );
          await client.query(
            `INSERT INTO import_audit.import_issues(run_id,sheet_name,row_number,field_name,code,severity,resolution_state) VALUES($1,$2,$3,'transaction',$4,'blocking','open')`,
            [staged.id, anchor.sheet, anchor.row, code],
          );
          failure.issues = (
            await client.query(
              'SELECT sheet_name AS sheet,row_number AS row,field_name AS field,code,severity FROM import_audit.import_issues WHERE run_id=$1 ORDER BY id',
              [staged.id],
            )
          ).rows;
          await client.query(
            "UPDATE import_audit.import_runs SET status='failed',completed_at=now(),result=$2 WHERE id=$1",
            [staged.id, JSON.stringify(failure)],
          );
          return failure;
        });
      }
  }
  await privateWrite(
    join(output, 'dispositions.json'),
    canonicalJson(
      rows.map((row) => ({
        sheet: row.sheet,
        row: row.row,
        dispositions: isReviewedEmptyRow(row, policy)
          ? { scope: 'reviewed-empty-template-evidence' }
          : row.cells.some((c) => c.header === 'Title') &&
              row.cells.some((c) => c.header === 'Platform')
            ? normalizeBook(row, manifest, policy).dispositions
            : { scope: 'pending-later-scope' },
      })) as unknown as Json,
    ),
  );
  await privateWrite(join(output, 'report.json'), canonicalJson(result as unknown as Json));
  return result;
}
