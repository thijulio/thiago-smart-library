import { isBookChange } from '@smart-library/domain';
import { isRequestId, LibraryServiceError, type LibraryService } from './library-service';
import { privateJson, privateHeaders } from './private-library';
type Auth = {
  api: {
    getSession(options: {
      headers: Headers;
      query: { disableCookieCache: true };
    }): Promise<{ user: { id: string; emailVerified: boolean } } | null>;
  };
};
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
async function readBody(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .match(/^application\/json$/i)
  )
    throw new LibraryServiceError('JSON_REQUIRED', 415);
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new LibraryServiceError('REQUEST_TOO_LARGE', 413);
      }
      chunks.push(part.value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new LibraryServiceError('INVALID_JSON', 400);
  }
}
export async function changeResponse(
  request: Request,
  auth: Auth,
  service: LibraryService,
  origin: string,
): Promise<Response> {
  if (!request.headers.get('cookie')) return privateJson({ error: 'Sign in required' }, 401);
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session) return privateJson({ error: 'Sign in required' }, 401);
    if (session.user.emailVerified !== true)
      return privateJson({ error: 'A verified account is required' }, 403);
    const path = new URL(request.url).pathname;
    const proposalMatch = /^\/api\/private\/changes\/([^/]+)(\/confirm)?$/.exec(path);
    const editableMatch = /^\/api\/private\/editable-books\/([^/]+)$/.exec(path);
    const create = path === '/api/private/changes';
    if (!create && !proposalMatch && !editableMatch)
      return privateJson({ error: 'Not found' }, 404);
    if (proposalMatch && !isRequestId(proposalMatch[1]))
      return privateJson({ error: 'Not found' }, 404);
    const method = create || proposalMatch?.[2] ? 'POST' : 'GET';
    if (request.method !== method)
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...privateHeaders, allow: method },
      });
    if (method === 'POST' && request.headers.get('origin') !== origin)
      return privateJson({ error: 'Origin not allowed' }, 403);
    const actor = session.user.id;
    if (editableMatch) {
      let id: string;
      try {
        id = decodeURIComponent(editableMatch[1]!);
      } catch {
        return privateJson({ error: 'Not found' }, 404);
      }
      return privateJson({ book: await service.getEditableBook(actor, id) });
    }
    if (method === 'GET')
      return privateJson({ proposal: await service.getProposal(actor, proposalMatch![1]!) });
    const body = await readBody(request);
    if (!object(body) || !isRequestId(body.requestId) || Object.keys(body).length !== 2)
      return privateJson({ error: 'Invalid request' }, 400);
    if (create) {
      if (!isBookChange(body.change)) return privateJson({ error: 'Invalid change' }, 400);
      return privateJson({
        proposal: await service.prepare(actor, body.requestId, body.change, 'site'),
      });
    }
    if (typeof body.digest !== 'string' || !/^[a-f0-9]{64}$/.test(body.digest))
      return privateJson({ error: 'Invalid digest' }, 400);
    return privateJson({
      receipt: await service.confirmAndCommit(
        actor,
        body.requestId,
        proposalMatch![1]!,
        body.digest,
      ),
    });
  } catch (error) {
    return error instanceof LibraryServiceError
      ? privateJson({ error: error.code }, error.status)
      : privateJson({ error: 'Library temporarily unavailable' }, 503);
  }
}
