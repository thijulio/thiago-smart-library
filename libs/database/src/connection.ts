import { Pool } from 'pg';
export type SqlClient = Pick<import('pg').PoolClient, 'query'>;
export function localPool(url: string) {
  return new Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 5000,
    options: '-c lock_timeout=5000 -c statement_timeout=30000',
  });
}
export async function withTransaction<T>(
  pool: Pool,
  work: (client: SqlClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // A failed rollback or unknown commit outcome is never retried.
      try {
        await client.query('ROLLBACK');
      } catch {
        throw new Error('TRANSACTION_ROLLBACK_FAILED', { cause: error });
      }
      const code = (error as { code?: string }).code;
      if (attempt >= 2 || !['40001', '40P01'].includes(code ?? '')) throw error;
    } finally {
      client.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 25 + Math.floor(Math.random() * 51)));
  }
}
/** Direct hosted connection; TLS verification comes from the required sslmode=verify-full. */
export function hostedPool(url: string, statementTimeoutMs = 30000) {
  return new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10000,
    options: `-c lock_timeout=5000 -c statement_timeout=${statementTimeoutMs}`,
  });
}
