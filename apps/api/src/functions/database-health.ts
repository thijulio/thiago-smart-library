import { neon } from '@neondatabase/serverless';

type DatabaseProbe = () => Promise<void>;

const json = (body: object, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export function createDatabaseHealth(databaseProbe: DatabaseProbe) {
  return async function databaseHealth(request: Request): Promise<Response> {
    if (request.method !== 'GET')
      return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });

    try {
      await databaseProbe();
      return json({ status: 'ok' }, 200);
    } catch {
      return json({ status: 'unavailable' }, 503);
    }
  };
}

export function getPooledDatabaseUrl(databaseUrl: string | undefined): string {
  try {
    if (!databaseUrl) throw new Error();

    const url = new URL(databaseUrl);
    const isPooledNeonUrl =
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      url.hostname.endsWith('.neon.tech') &&
      url.hostname.includes('-pooler.');
    if (!isPooledNeonUrl) throw new Error();

    return databaseUrl;
  } catch {
    throw new Error('DATABASE_URL must be a pooled Neon URL');
  }
}

async function probeConfiguredDatabase(): Promise<void> {
  const databaseUrl = getPooledDatabaseUrl(process.env.DATABASE_URL);
  const sql = neon(databaseUrl);
  await sql`SELECT 1`;
}

export const databaseHealth = createDatabaseHealth(probeConfiguredDatabase);
export default databaseHealth;
