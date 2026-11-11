import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { isBookChange } from '@smart-library/domain';
import type { BookChange } from '@smart-library/domain';
import { LibraryServiceError, type LibraryService } from './library-service';

export interface McpPrincipal {
  userId: string;
  clientId: string;
  scopes: string[];
}
interface McpOptions {
  origin: string;
  service: LibraryService;
  resolvePrincipal(request: Request): Promise<McpPrincipal | null>;
}
function jsonError(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
const stableId = z.string().min(1).max(500);
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const platform = z.enum(['Audible', 'Kindle', 'Physical', 'Unknown']);
const status = z.enum(['wishlist', 'unread', 'reading', 'paused', 'read']);
const fields = {
  platform: platform.optional(),
  status: status.optional(),
  rating: z.number().min(1).max(5).multipleOf(0.5).nullable().optional(),
  opinion: z.string().max(4000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  finishedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
};
const counter = z.string().regex(/^[1-9][0-9]{0,18}$/);
const change = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...fields,
      type: z.literal('create'),
      title: z.string().min(1).max(500),
      authors: z.array(z.string().min(1).max(200)).min(1).max(16),
      platform,
      status,
    }),
    z.strictObject({
      type: z.literal('update'),
      stableId,
      expectedVersion: counter,
      expectedFeedbackVersion: counter.nullable(),
      patch: z.strictObject(fields),
    }),
  ])
  .refine(isBookChange, 'Invalid book change');

export async function mcpResponse(request: Request, options: McpOptions): Promise<Response> {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin !== null && requestOrigin !== options.origin)
    return jsonError(403, 'Origin not allowed');
  let principal: McpPrincipal | null;
  try {
    principal = await options.resolvePrincipal(request);
  } catch {
    principal = null;
  }
  if (!principal)
    return jsonError(401, 'Authorization required', {
      'WWW-Authenticate': `Bearer resource_metadata="${options.origin}/.well-known/oauth-protected-resource/mcp"`,
    });
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed', { Allow: 'POST' });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 32768) {
          await reader.cancel();
          return jsonError(413, 'MCP request too large');
        }
        chunks.push(chunk.value);
      }
    }
  } catch {
    return jsonError(400, 'Invalid MCP request');
  }
  const bodyBytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  request = new Request(request.url, { method: 'POST', headers: request.headers, body: bodyBytes });
  const server = new McpServer({ name: 'Smart Library', version: '1.0.0' });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const { service } = options;
  const actor = principal.userId;
  const register = (
    name: string,
    description: string,
    schema: z.ZodType,
    write: boolean,
    operation: (args: Record<string, unknown>) => Promise<unknown>,
  ) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema as z.ZodObject,
        annotations: {
          readOnlyHint: !write,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args) => {
        if (
          !principal.scopes.includes('library:read') ||
          (write && !principal.scopes.includes('library:write'))
        ) {
          return { isError: true, content: [{ type: 'text', text: 'Insufficient scope' }] };
        }
        try {
          const result = await operation(args as Record<string, unknown>);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) {
          const text =
            error instanceof LibraryServiceError
              ? JSON.stringify({ error: error.code, status: error.status })
              : 'Library operation unavailable';
          return { isError: true, content: [{ type: 'text', text }] };
        }
      },
    );
  };
  register(
    'search_books',
    'Search your library.',
    z.strictObject({ query: z.string().max(200) }),
    false,
    (a) => service.searchBooks(actor, a.query as string),
  );
  register('get_book', 'Read one book in your library.', z.strictObject({ stableId }), false, (a) =>
    service.getBook(actor, a.stableId as string),
  );
  register('list_reading', 'List your current reading.', z.strictObject({}), false, () =>
    service.listReading(actor),
  );
  register(
    'prepare_change',
    'Prepare a change without saving. Open reviewUrl and approve in your signed-in browser before commit_change.',
    z.strictObject({ requestId: uuid, change }),
    true,
    async (a) => {
      const proposal = await service.prepare(
        actor,
        a.requestId as string,
        a.change as BookChange,
        'mcp',
      );
      return { ...proposal, reviewUrl: `${options.origin}/library/changes/${proposal.id}` };
    },
  );
  register(
    'get_change',
    'Read your prepared change and its approval status.',
    z.strictObject({ id: uuid }),
    true,
    (a) => service.getProposal(actor, a.id as string),
  );
  register(
    'commit_change',
    'Retrieve or replay the receipt after browser approval. This tool cannot approve a change.',
    z.strictObject({ requestId: uuid, id: uuid, digest }),
    true,
    (a) => service.commit(actor, a.requestId as string, a.id as string, a.digest as string),
  );
  try {
    await server.connect(transport);
    // JSON responses are fully materialized before per-request transports are closed.
    const response = await transport.handleRequest(request);
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(body.byteLength ? body : null, { status: response.status, headers });
  } catch {
    return jsonError(400, 'Invalid MCP request');
  } finally {
    await server.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
