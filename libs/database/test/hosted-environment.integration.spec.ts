import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { localPool } from '../src/connection';
import { initializeHostedEnvironment } from '../src/environment';
import { assertMarker } from '../src/migrate';
import { validateLocalTarget } from '../src/target';
import { syntheticAdminUrl } from './harness';
async function emptyDatabase() {
  const adminUrl = validateLocalTarget(
    process.env.DB_TEST_ADMIN_URL ?? syntheticAdminUrl,
    process.env,
  ).url;
  const admin = localPool(adminUrl);
  const name = `smart_library_test_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = localPool(url.toString());
  return {
    db,
    async dispose() {
      await db.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    },
  };
}
it('marks an empty database once and pins its purpose', async () => {
  const { db, dispose } = await emptyDatabase();
  try {
    const first = await initializeHostedEnvironment(db, 'staging');
    expect(first.purpose).toBe('staging');
    await expect(initializeHostedEnvironment(db, 'staging')).resolves.toMatchObject({
      instance_id: first.instance_id,
    });
    await expect(initializeHostedEnvironment(db, 'production')).rejects.toThrow(
      'UNSAFE_DATABASE_MARKER',
    );
    await expect(assertMarker(db, first.instance_id, 'production')).rejects.toThrow(
      'UNSAFE_DATABASE_MARKER',
    );
    await expect(
      assertMarker(db, '00000000-0000-4000-8000-000000000000', 'staging'),
    ).rejects.toThrow('UNSAFE_DATABASE_MARKER');
  } finally {
    await dispose();
  }
});
it('refuses to bootstrap a database that already has objects', async () => {
  const { db, dispose } = await emptyDatabase();
  try {
    await db.query('CREATE TABLE public.existing_health(id int)');
    await expect(initializeHostedEnvironment(db, 'production')).rejects.toThrow(
      'UNAPPROVED_DATABASE_BOOTSTRAP',
    );
  } finally {
    await dispose();
  }
});
it('treats provider default privileges on public as empty, but not objects', async () => {
  const { db, dispose } = await emptyDatabase();
  try {
    // Neon sets default privileges for its admin role on public in every new database.
    await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC');
    await expect(initializeHostedEnvironment(db, 'staging')).resolves.toMatchObject({
      purpose: 'staging',
    });
  } finally {
    await dispose();
  }
});
