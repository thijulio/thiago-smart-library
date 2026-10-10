import { defineEventHandler } from 'h3';
export default defineEventHandler(
  () =>
    new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
);
