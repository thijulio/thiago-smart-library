import { describe, expect, it } from 'vitest';
import { validateLocalTarget, validateDisposableContainer } from './target';
describe('disposable target safety', () => {
  it('accepts only an explicit loopback synthetic database', () => {
    expect(
      validateLocalTarget('postgres://test:synthetic@127.0.0.1:55432/smart_library_test_admin')
        .database,
    ).toBe('smart_library_test_admin');
  });
  it.each([
    'postgres://test@remote.example/smart_library_test_x',
    'postgres://test@pooler.example/smart_library_test_x',
    'postgres://test@localhost/library',
    'postgres://test@localhost/smart_library_test_x?host=remote.example',
    'postgres://test@localhost/smart_library_test_x?sslmode=disable',
  ])('rejects unsafe target without connecting: %s', (url) => {
    expect(() => validateLocalTarget(url)).toThrow('UNSAFE_DATABASE_TARGET');
  });
  it('rejects missing URL and inherited diagnostic URL', () => {
    expect(() => validateLocalTarget(undefined)).toThrow('MISSING_DATABASE_TARGET');
    expect(() =>
      validateLocalTarget('postgres://test@localhost/smart_library_test_x', {
        DATABASE_URL: 'present',
      }),
    ).toThrow('INHERITED_DATABASE_URL');
  });
});
it('does not fall back to import/owner/public variables', () => {
  expect(() =>
    validateLocalTarget(undefined, {
      DB_IMPORT_URL: 'irrelevant',
      DB_OWNER_URL: 'irrelevant',
      DATABASE_PUBLIC_URL: 'irrelevant',
    }),
  ).toThrow('MISSING_DATABASE_TARGET');
});
const container = {
  Config: {
    Image: 'postgres:16.15',
    Labels: {
      'com.docker.compose.project': 'smart-library-db-test',
      'com.docker.compose.service': 'postgres',
    },
  },
  HostConfig: {
    Tmpfs: { '/var/lib/postgresql/data': '' },
    PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55433' }] },
  },
  Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
};
it('accepts only the disposable service identity and exact tmpfs/bind', () =>
  expect(() => validateDisposableContainer(container)).not.toThrow());
it.each([
  { ...container, Config: { ...container.Config, Image: 'postgres:latest' } },
  { ...container, Mounts: [{ Type: 'volume', Destination: '/var/lib/postgresql/data' }] },
  { ...container, HostConfig: { ...container.HostConfig, Tmpfs: {} } },
  {
    ...container,
    HostConfig: {
      ...container.HostConfig,
      PortBindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55433' }] },
    },
  },
  {
    ...container,
    Config: {
      ...container.Config,
      Labels: {
        'com.docker.compose.project': 'unrelated',
        'com.docker.compose.service': 'postgres',
      },
    },
  },
])('rejects a non-disposable Docker identity', (input) =>
  expect(() => validateDisposableContainer(input)).toThrow('UNSAFE_TEST_CONTAINER'),
);
