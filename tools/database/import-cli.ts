import { parseArgs } from 'node:util';
import { localPool, hostedPool } from '../../libs/database/src/connection';
import {
  validateLocalTarget,
  validateHostedTarget,
  validateInstanceId,
} from '../../libs/database/src/target';
import { extractWorkbook, runImport, verifyCore } from '../../libs/importer/src';
export async function importerCli(
  operation: 'extract' | 'import' | 'verify',
  args = process.argv.slice(2),
) {
  let usage = false;
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options:
        operation === 'extract'
          ? {
              help: { type: 'boolean' },
              'source-file': { type: 'string' },
              out: { type: 'string' },
              'source-key': { type: 'string' },
              'effective-at': { type: 'string' },
              'freshness-approved-by': { type: 'string' },
            }
          : operation === 'import'
            ? {
                help: { type: 'boolean' },
                snapshot: { type: 'string' },
                scope: { type: 'string' },
                'dry-run': { type: 'boolean' },
                apply: { type: 'boolean' },
                report: { type: 'string' },
                resolutions: { type: 'string' },
                policy: { type: 'string' },
                target: { type: 'string' },
                'confirm-host': { type: 'string' },
                'confirm-production': { type: 'boolean' },
              }
            : {
                help: { type: 'boolean' },
                scope: { type: 'string' },
                'run-id': { type: 'string' },
                target: { type: 'string' },
                'confirm-host': { type: 'string' },
                'confirm-production': { type: 'boolean' },
              },
    });
    if (values.help) {
      console.log(
        operation === 'extract'
          ? 'Usage: db:extract --source-file PATH --out NEW_PRIVATE_DIRECTORY --source-key KEY --effective-at UTC_ISO --freshness-approved-by REVIEWER (immutable XLSX export; no DB/network)'
          : operation === 'import'
            ? 'Usage: db:import --snapshot PRIVATE_DIRECTORY --scope core --dry-run|--apply --report NEW_PRIVATE_DIRECTORY [--resolutions PRIVATE_JSON] [--policy REVIEWED_PRIVATE_JSON] [--target staging|production --confirm-host HOST [--confirm-production]] (DB_IMPORT_URL only)'
            : 'Usage: db:verify --scope core --run-id UUID [--target staging|production --confirm-host HOST [--confirm-production]] (DB_IMPORT_URL only)',
      );
      return 0;
    }
    const text = (key: string) => {
      const v = values[key];
      if (typeof v !== 'string' || !v.trim()) {
        usage = true;
        throw new Error('INVALID_USAGE');
      }
      return v;
    };
    if (positionals.length) {
      usage = true;
      throw new Error('INVALID_USAGE');
    }
    if (operation === 'extract') {
      const m = await extractWorkbook({
        sourcePath: text('source-file'),
        outputDirectory: text('out'),
        sourceKey: text('source-key'),
        effectiveAt: text('effective-at'),
        freshnessApprovedBy: text('freshness-approved-by'),
      });
      console.log(
        JSON.stringify({
          status: 'extracted',
          sheets: m.sheets.length,
          rows: m.sheets.reduce((n, s) => n + s.populatedRows, 0),
        }),
      );
      return 0;
    }
    if (text('scope') !== 'core') {
      usage = true;
      throw new Error('INVALID_SCOPE');
    }
    if (operation === 'import' && !!values['dry-run'] === !!values.apply) {
      usage = true;
      throw new Error('EXACTLY_ONE_MODE_REQUIRED');
    }
    const snapshot = operation === 'import' ? text('snapshot') : '';
    const report = operation === 'import' ? text('report') : '';
    const id = operation === 'verify' ? text('run-id') : '';
    if (operation === 'verify' && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) {
      usage = true;
      throw new Error('INVALID_RUN_ID');
    }
    const kind = values.target ?? 'local-test';
    if (!['local-test', 'staging', 'production'].includes(String(kind))) {
      usage = true;
      throw new Error('INVALID_TARGET');
    }
    if (kind === 'production' && values['confirm-production'] !== true) {
      usage = true;
      throw new Error('PRODUCTION_NOT_CONFIRMED');
    }
    const importTarget =
      kind === 'local-test'
        ? { kind: 'local-test' as const }
        : {
            kind: 'hosted' as const,
            purpose: kind as 'staging' | 'production',
            instanceId: validateInstanceId(process.env.DB_TARGET_INSTANCE_ID),
            confirmHost: text('confirm-host'),
          };
    const db =
      importTarget.kind === 'hosted'
        ? hostedPool(
            validateHostedTarget(process.env.DB_IMPORT_URL, process.env, importTarget.confirmHost)
              .url,
            120000,
          )
        : localPool(validateLocalTarget(process.env.DB_IMPORT_URL, process.env).url);
    try {
      if (operation === 'verify') {
        console.log(JSON.stringify(await verifyCore(db, id, importTarget)));
        return 0;
      }
      const r = await runImport(
        {
          snapshotDirectory: snapshot,
          scope: 'core',
          mode: values.apply ? 'apply' : 'dry-run',
          reportDirectory: report,
          policyFile: typeof values.policy === 'string' ? values.policy : undefined,
          resolutionFile: typeof values.resolutions === 'string' ? values.resolutions : undefined,
          target: importTarget,
        },
        db,
      );
      console.log(
        JSON.stringify({
          status: r.status,
          runId: r.runId,
          inserted: r.inserted,
          updated: r.updated,
          unchanged: r.unchanged,
          quarantined: r.quarantined,
          conflicts: r.conflicts,
        }),
      );
      return r.exitCode;
    } finally {
      await db.end();
    }
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    const invalidUsage = usage || error.code?.startsWith('ERR_PARSE_ARGS_');
    const blocked = new Set([
      'INVALID_SOURCE',
      'INVALID_FRESHNESS',
      'INVALID_CELL_DATE',
      'INVALID_CELL_NUMBER',
      'UNSUPPORTED_CELL',
      'CELL_LIMIT',
      'SOURCE_LIMIT',
      'SHEET_LIMIT',
      'ROW_LIMIT',
      'ARCHIVE_LIMIT',
      'INVALID_XLSX_ARCHIVE',
      'MERGED_TABULAR_CELLS',
      'SNAPSHOT_OVERWRITE',
      'INVALID_MANIFEST',
      'INVALID_MANIFEST_SHEET',
      'INVALID_SNAPSHOT_ROWS',
      'INVALID_SNAPSHOT_CELL',
      'INVALID_SNAPSHOT_COUNT',
      'SNAPSHOT_HASH_MISMATCH',
      'INVALID_RESOLUTION',
      'FORBIDDEN_CLEAR',
      'INVALID_IMPORT_POLICY',
      'INVALID_FORMULA_CACHE_POLICY',
      'UNSAFE_PRIVATE_EVIDENCE',
      'OUTPUT_EXISTS',
      'PRIVATE_OUTPUT_IN_REPOSITORY',
      'IMPORT_SCHEMA_MISMATCH',
      'PRIVILEGED_IMPORT_LOGIN',
    ]).has(error.message);
    console.error(
      invalidUsage ? 'INVALID_USAGE' : blocked ? 'IMPORT_BLOCKED' : 'IMPORT_OPERATION_FAILED',
    );
    return invalidUsage ? 64 : blocked ? 3 : 4;
  }
}
