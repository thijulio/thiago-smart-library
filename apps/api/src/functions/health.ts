import type { HealthResponse } from '@smart-library/domain';

export async function health(request: Request): Promise<Response> {
  if (request.method !== 'GET')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { Allow: 'GET', 'content-type': 'application/json' },
    });
  const body = { status: 'ok' } satisfies HealthResponse;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
export default health;
