import { expect, it } from 'vitest';
import { parseDatabaseArgs } from './target-args';
const host = 'ep-x.eu-central-1.aws.neon.tech';
it('keeps the local synthetic form', () => {
  expect(parseDatabaseArgs(['migrate', '--target', 'local-test'])).toEqual({
    command: 'migrate',
    target: { kind: 'local-test' },
  });
});
it('parses a confirmed staging target', () => {
  expect(parseDatabaseArgs(['bootstrap', '--target', 'staging', '--confirm-host', host])).toEqual({
    command: 'bootstrap',
    target: { kind: 'hosted', purpose: 'staging', confirmHost: host },
  });
});
it('requires the production confirmation flag', () => {
  expect(() =>
    parseDatabaseArgs(['migrate', '--target', 'production', '--confirm-host', host]),
  ).toThrow('INVALID_ARGUMENTS');
  expect(
    parseDatabaseArgs([
      'migrate',
      '--target',
      'production',
      '--confirm-host',
      host,
      '--confirm-production',
    ]),
  ).toEqual({
    command: 'migrate',
    target: { kind: 'hosted', purpose: 'production', confirmHost: host },
  });
});
it.each([
  [['bootstrap', '--target', 'local-test']],
  [['drop', '--target', 'staging', '--confirm-host', host]],
  [['migrate', '--target', 'staging']],
  [['migrate', '--target', 'staging', '--confirm-host', host, '--confirm-production']],
  [['migrate', '--target', 'preview', '--confirm-host', host]],
])('refuses %j', (args) => {
  expect(() => parseDatabaseArgs(args)).toThrow('INVALID_ARGUMENTS');
});
