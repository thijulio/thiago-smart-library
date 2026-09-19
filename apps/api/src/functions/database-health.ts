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

async function probeConfiguredDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');

  const sql = neon(databaseUrl);
  await sql`SELECT 1`;
}

export const databaseHealth = createDatabaseHealth(probeConfiguredDatabase);
export default databaseHealth;
