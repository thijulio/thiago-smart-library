import { it, expect, vi } from 'vitest';
import { importerCli } from './import-cli';
const invalidArguments: string[][] = [
  [],
  ['--unknown'],
  ['--scope'],
  ['--scope', 'core', '--apply', '--dry-run', '--snapshot', 'x', '--report', 'y'],
  ['--scope', 'core', '--apply'],
];
it.each(invalidArguments.map((args) => [args]))(
  'invalid import arguments fail before connecting %j',
  async (args) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await importerCli('import', args)).toBe(64);
    } finally {
      log.mockRestore();
    }
  },
);
it.each(['extract', 'import', 'verify'] as const)(
  'help for %s needs no credentials',
  async (op) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await importerCli(op, ['--help'])).toBe(0);
    } finally {
      log.mockRestore();
    }
  },
);

it('invalid source shape is a blocked input, not an execution failure', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(
      await importerCli('extract', [
        '--source-file',
        '/unused.txt',
        '--out',
        '/unused',
        '--source-key',
        'synthetic',
        '--effective-at',
        '2026-10-02T12:00:00Z',
        '--freshness-approved-by',
        'synthetic-reviewer',
      ]),
    ).toBe(3);
  } finally {
    log.mockRestore();
  }
});
