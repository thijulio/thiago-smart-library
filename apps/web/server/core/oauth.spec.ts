import { describe, expect, it } from 'vitest';
import { createProductAuth } from './auth';
import { productAuthResponse } from './auth-response';
import { readRuntimeConfig } from './config';

const origin = 'https://library.example.test';
const config = {
  origin,
  secret: 'synthetic-secret-at-least-thirty-two-characters',
  googleClientId: 'synthetic',
  googleClientSecret: 'synthetic',
  databaseUrl: '',
};

describe('optional MCP OAuth provider', () => {
  it('stays disabled unless explicitly enabled in server configuration', () => {
    const env = {
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: config.secret,
      GOOGLE_CLIENT_ID: 'synthetic',
      GOOGLE_CLIENT_SECRET: 'synthetic',
      DATABASE_RUNTIME_URL:
        'postgresql://sl_app_runtime:synthetic@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    };
    expect(readRuntimeConfig(env).mcpOAuthEnabled).toBe(false);
    expect(readRuntimeConfig({ ...env, MCP_OAUTH_ENABLED: 'true' }).mcpOAuthEnabled).toBe(true);
    expect(readRuntimeConfig({ ...env, MCP_OAUTH_ENABLED: '1' }).mcpOAuthEnabled).toBe(false);
  });
  it('does not install provider endpoints by default', async () => {
    const request = new Request(origin + '/api/auth/.well-known/oauth-authorization-server');
    const off = createProductAuth({} as never, config);
    expect((await productAuthResponse(request, off)).status).toBe(404);
    expect(off.options.plugins.some((plugin) => plugin.id === 'oauth-provider')).toBe(false);
  });
});

describe('authorization body limits', () => {
  it('bounds streamed registration, consent and Google login before forwarding', async () => {
    let forwarded = false;
    const auth = {
      options: { baseURL: origin, plugins: [{ id: 'oauth-provider' }] },
      async handler() {
        forwarded = true;
        return new Response('{}');
      },
    } as unknown as Parameters<typeof productAuthResponse>[1];
    for (const path of ['/oauth2/register', '/oauth2/consent', '/sign-in/social']) {
      const request = new Request(origin + '/api/auth' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', padding: 'x'.repeat(32768) }),
      });
      expect((await productAuthResponse(request, auth)).status).toBe(413);
    }
    expect(forwarded).toBe(false);
  });
});
