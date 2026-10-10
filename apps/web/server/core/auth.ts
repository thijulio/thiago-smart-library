import { betterAuth, APIError } from 'better-auth';
import { PostgresDialect } from 'kysely';
import type { AuthConfig } from './config';
import { permitsUser } from './config';

type AuthPool = ConstructorParameters<typeof PostgresDialect>[0]['pool'];
export function createProductAuth(pool: AuthPool, config: AuthConfig) {
  return betterAuth({
    appName: 'Smart Library',
    baseURL: config.origin,
    secret: config.secret,
    trustedOrigins: [config.origin],
    logger: { disabled: true },
    // Propagate ordinary exceptions before better-call's fallback console logger.
    onAPIError: { throw: true, errorURL: config.origin + '/?signin=error' },
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        scope: ['openid', 'email', 'profile'],
        includeGrantedScopes: false,
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    advanced: { useSecureCookies: true },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!permitsUser(user))
              throw new APIError('FORBIDDEN', { message: 'A verified account is required' });
            return { data: user };
          },
        },
      },
    },
  });
}
