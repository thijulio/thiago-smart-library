export async function health(request: Request): Promise<Response> {
  if (request.method !== 'GET')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { Allow: 'GET', 'content-type': 'application/json' },
    });
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
export default health;
