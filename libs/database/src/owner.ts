import type { SqlClient } from './connection';
/** Full URL parsing belongs at the trusted server boundary; SQL also checks scheme. */
export function validateHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    /\s/.test(value)
  )
    throw new Error('INVALID_URL');
  return value;
}
export async function patchBook(
  client: SqlClient,
  stableId: string,
  expectedVersion: string,
  patch: Record<string, unknown>,
  requestId: string,
) {
  if (patch.cover_url !== undefined && patch.cover_url !== null) {
    if (typeof patch.cover_url !== 'string') throw new Error('INVALID_URL');
    validateHttpUrl(patch.cover_url);
  }
  return (
    await client.query('SELECT library.patch_book($1,$2,$3::jsonb,$4) AS result', [
      stableId,
      expectedVersion,
      JSON.stringify(patch),
      requestId,
    ])
  ).rows[0].result;
}
export async function createBook(
  client: SqlClient,
  payload: Record<string, unknown>,
  requestId: string,
) {
  if (payload.cover_url !== undefined && payload.cover_url !== null) {
    if (typeof payload.cover_url !== 'string') throw new Error('INVALID_URL');
    validateHttpUrl(payload.cover_url);
  }
  return (
    await client.query('SELECT library.create_book($1::jsonb,$2) AS result', [
      JSON.stringify(payload),
      requestId,
    ])
  ).rows[0].result;
}
