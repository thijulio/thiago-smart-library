import { it, expect } from 'vitest';
import { createTestDatabase, syntheticAdminUrl } from './harness';
import { localPool } from '../src/connection';
import { validateLocalTarget } from '../src/target';
it('bootstrap refuses unsafe preexisting permission group attributes', async () => {
  const initial = await createTestDatabase();
  await initial.dispose();
  const target = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  );
  const admin = localPool(target.url);
  try {
    await admin.query('ALTER ROLE library_public_reader LOGIN');
    await expect(createTestDatabase()).rejects.toThrow('UNSAFE_EXISTING_ROLE');
  } finally {
    await admin.query('ALTER ROLE library_public_reader NOLOGIN');
    await admin.end();
  }
});
it('bootstrap rejects permission groups that inherit owner', async () => {
  const target = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  );
  const admin = localPool(target.url);
  try {
    await admin.query('GRANT library_owner TO library_importer');
    let rejected = false;
    try {
      const unsafe = await createTestDatabase();
      await unsafe.dispose();
    } catch (error) {
      rejected = (error as Error).message === 'UNSAFE_EXISTING_ROLE';
    }
    expect(rejected).toBe(true);
  } finally {
    await admin.query('REVOKE library_owner FROM library_importer');
    await admin.end();
  }
});
it('migrates an explicitly marked blank local target preserving instance UUID', async () => {
  const target = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  );
  const admin = localPool(target.url);
  const { randomBytes } = await import('node:crypto');
  const name = 'smart_library_test_' + randomBytes(8).toString('hex');
  const url = new URL(target.url);
  url.pathname = '/' + name;
  const pool = localPool(url.toString());
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const { initializeTestAdmin } = await import('../src/environment');
    const { assertMarker, migrate } = await import('../src/migrate');
    await initializeTestAdmin(pool);
    const before = await assertMarker(pool);
    const c = await pool.connect();
    try {
      await c.query("SELECT set_config('smart_library.purpose','synthetic-test',false)");
      expect((await migrate(c, 'libs/database/migrations')).applied).toHaveLength(4);
      expect((await assertMarker(c)).instance_id).toBe(before.instance_id);
    } finally {
      c.release();
    }
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
