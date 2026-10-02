import { beforeAll, afterAll, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createTestDatabase, syntheticAdminUrl } from './harness';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.dispose();
});
it('CLI status is read-only and doctor emits no credentials', () => {
  const url = new URL(process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl);
  url.pathname = '/' + db.name;
  for (const command of ['status', 'doctor', 'migrate']) {
    const r = spawnSync(
      'node',
      ['node_modules/tsx/dist/cli.mjs', 'tools/database/cli.ts', command, '--target', 'local-test'],
      { encoding: 'utf8', env: { ...process.env, DB_MIGRATION_URL: url.toString() } },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(url.password);
    expect(r.stdout).not.toContain('postgresql://');
  }
});
it('CLI never mutates missing, wrong or pooled targets', () => {
  for (const raw of [
    '',
    'postgres://test@pooler.example/smart_library_test_x',
    'postgres://test@localhost/library',
  ]) {
    const r = spawnSync(
      'node',
      [
        'node_modules/tsx/dist/cli.mjs',
        'tools/database/cli.ts',
        'migrate',
        '--target',
        'local-test',
      ],
      { encoding: 'utf8', env: { ...process.env, DB_MIGRATION_URL: raw } },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('DATABASE_OPERATION_FAILED');
    if (raw) expect(r.stderr).not.toContain(raw);
  }
});
