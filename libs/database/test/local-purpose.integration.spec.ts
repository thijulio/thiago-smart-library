import { it, expect } from 'vitest';
import { createTestDatabase } from './harness';
import { assertMarker } from '../src/migrate';
it('requires explicit purpose and pinned identity for a persistent marker; test cleanup refuses it', async () => {
  const db = await createTestDatabase();
  try {
    await db.owner.query("UPDATE db_meta.environment SET purpose='staging'");
    await expect(assertMarker(db.owner)).rejects.toThrow('UNSAFE_DATABASE_MARKER');
    await expect(db.dispose()).rejects.toThrow('UNSAFE_DATABASE_MARKER');
    await expect(assertMarker(db.owner, db.instanceId, 'staging')).resolves.toMatchObject({
      purpose: 'staging',
    });
    await expect(
      assertMarker(db.owner, '00000000-0000-4000-8000-000000000000', 'staging'),
    ).rejects.toThrow('UNSAFE_DATABASE_MARKER');
  } finally {
    await db.owner.query("UPDATE db_meta.environment SET purpose='synthetic-test'");
    await db.dispose();
  }
});
