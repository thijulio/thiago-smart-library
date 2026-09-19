import { describe, expect, it } from 'vitest';
import { createDatabaseHealth, getPooledDatabaseUrl } from './functions/database-health';

describe('database health function', () => {
  it('returns public status JSON when the database probe succeeds', async () => {
    const databaseHealth = createDatabaseHealth(async () => undefined);

    const response = await databaseHealth(new Request('https://example.test/api/health/db'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('returns unavailable without exposing a failed database probe', async () => {
    const databaseHealth = createDatabaseHealth(async () => {
      throw new Error('connection refused');
    });

    const response = await databaseHealth(new Request('https://example.test/api/health/db'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' });
  });

  it('returns 405 for unsupported methods', async () => {
    const databaseHealth = createDatabaseHealth(async () => undefined);

    const response = await databaseHealth(
      new Request('https://example.test/api/health/db', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});

describe('pooled database URL', () => {
  it('accepts a pooled Neon connection URL', () => {
    const databaseUrl =
      'postgresql://neondb_owner:password@ep-floral-wave-b4xv97ne-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

    expect(getPooledDatabaseUrl(databaseUrl)).toBe(databaseUrl);
  });

  it('rejects a direct Neon connection URL', () => {
    const databaseUrl =
      'postgresql://neondb_owner:password@ep-floral-wave-b4xv97ne.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

    expect(() => getPooledDatabaseUrl(databaseUrl)).toThrow(
      'DATABASE_URL must be a pooled Neon URL',
    );
  });

  it('rejects a malformed connection URL', () => {
    expect(() => getPooledDatabaseUrl('not-a-url')).toThrow(
      'DATABASE_URL must be a pooled Neon URL',
    );
  });
});
