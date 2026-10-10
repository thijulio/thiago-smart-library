import { describe, expect, it } from 'vitest';
import { readRuntimeConfig, permitsUser } from './config';

const valid = {
  BETTER_AUTH_URL: 'https://library.example.test',
  BETTER_AUTH_SECRET: 'synthetic-secret-at-least-thirty-two-characters',
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
  DATABASE_RUNTIME_URL:
    'postgresql://sl_app_runtime:synthetic@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require',
};
describe('private runtime configuration', () => {
  it('fails closed without the dedicated runtime URL, even with a legacy DB URL', () => {
    expect(() =>
      readRuntimeConfig({
        ...valid,
        DATABASE_RUNTIME_URL: '',
        DATABASE_URL: valid.DATABASE_RUNTIME_URL,
      }),
    ).toThrow('AUTH_CONFIGURATION_UNAVAILABLE');
  });
  it.each([
    'https://library.example.test/path',
    'http://library.example.test',
    'https://user:password@library.example.test',
  ])('rejects an unsafe origin %s', (url) => {
    expect(() => readRuntimeConfig({ ...valid, BETTER_AUTH_URL: url })).toThrow(
      'AUTH_CONFIGURATION_UNAVAILABLE',
    );
  });
  it('rejects broad legacy login roles and insecure database URLs', () => {
    for (const url of [
      valid.DATABASE_RUNTIME_URL.replace('sl_app_runtime', 'neondb_owner'),
      valid.DATABASE_RUNTIME_URL.replace('sslmode=require', 'sslmode=disable'),
    ]) {
      expect(() => readRuntimeConfig({ ...valid, DATABASE_RUNTIME_URL: url })).toThrow(
        'AUTH_CONFIGURATION_UNAVAILABLE',
      );
    }
  });
  it('permits any verified account regardless of identity provider', () => {
    expect(readRuntimeConfig(valid).origin).toBe('https://library.example.test');
    expect(permitsUser({ emailVerified: true })).toBe(true);
    expect(permitsUser({ emailVerified: false })).toBe(false);
  });
});
