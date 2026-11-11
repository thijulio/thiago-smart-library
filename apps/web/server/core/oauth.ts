import { oauthProvider, getOAuthProviderApi, type OAuthOptions } from '@better-auth/oauth-provider';
import { createAuthEndpoint } from 'better-auth/api';

export interface McpPrincipal {
  userId: string;
  clientId: string;
  scopes: string[];
}
export const mcpScopes = ['library:read', 'library:write'];
export function mcpOAuthPlugins(origin: string) {
  const options = {
    loginPage: '/oauth/login',
    consentPage: '/oauth/consent',
    scopes: mcpScopes,
    grantTypes: ['authorization_code'],
    resources: [origin + '/mcp'],
    clientRegistrationDefaultResources: [origin + '/mcp'],
    disableJwtPlugin: true,
    storeTokens: 'hashed',
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    accessTokenExpiresIn: 3600,
  } satisfies OAuthOptions<string[]>;
  return [
    oauthProvider(options),
    {
      id: 'smart-library-mcp-principal',
      endpoints: {
        // Invoked through auth.api only. The public HTTP boundary never forwards this path.
        mcpPrincipal: createAuthEndpoint(
          '/mcp-principal',
          { method: 'GET' },
          async (ctx): Promise<McpPrincipal | null> => {
            const authorization = ctx.headers?.get('authorization');
            const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization ?? '');
            if (!match || match[1]!.length > 4096) return null;
            try {
              const token = await getOAuthProviderApi(ctx, options).requireActiveAccessToken(
                match[1]!,
              );
              const audiences = Array.isArray(token.aud) ? token.aud : [token.aud];
              if (
                audiences.length !== 1 ||
                audiences[0] !== origin + '/mcp' ||
                typeof token.sid !== 'string' ||
                !token.sid ||
                typeof token.sub !== 'string' ||
                typeof token.client_id !== 'string' ||
                token.token_type !== 'Bearer'
              )
                return null;
              const session = await ctx.context.adapter.findOne<{
                id: string;
                userId: string;
                expiresAt: Date;
              }>({ model: 'session', where: [{ field: 'id', value: token.sid }] });
              const user = await ctx.context.internalAdapter.findUserById(token.sub);
              if (
                !session ||
                session.userId !== token.sub ||
                !(new Date(session.expiresAt).getTime() > Date.now()) ||
                user?.emailVerified !== true
              )
                return null;
              const scopes =
                typeof token.scope === 'string' ? token.scope.split(' ').filter(Boolean) : [];
              if (!scopes.length || scopes.some((scope) => !mcpScopes.includes(scope))) return null;
              return { userId: token.sub, clientId: token.client_id, scopes };
            } catch {
              return null;
            }
          },
        ),
      },
    },
  ];
}
export async function resolveMcpPrincipal(
  request: Request,
  auth: {
    options: { baseURL?: unknown; plugins?: { id: string }[] };
    api: { mcpPrincipal?: (input: { headers: Headers }) => Promise<unknown> };
  },
  origin: string,
): Promise<McpPrincipal | null> {
  if (
    auth.options.baseURL !== origin ||
    !auth.options.plugins?.some((p) => p.id === 'oauth-provider')
  )
    return null;
  try {
    return ((await auth.api.mcpPrincipal?.({ headers: request.headers })) ??
      null) as McpPrincipal | null;
  } catch {
    return null;
  }
}
export function mcpResourceMetadata(origin: string) {
  return {
    resource: origin + '/mcp',
    authorization_servers: [origin + '/api/auth'],
    scopes_supported: mcpScopes,
    bearer_methods_supported: ['header'],
  };
}
