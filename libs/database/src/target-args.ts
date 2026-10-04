import type { HostedPurpose } from './target';
export type DatabaseCommand = 'bootstrap' | 'migrate' | 'status' | 'doctor';
export type DatabaseTarget =
  | { kind: 'local-test' }
  | { kind: 'hosted'; purpose: HostedPurpose; confirmHost: string };
const COMMANDS: DatabaseCommand[] = ['bootstrap', 'migrate', 'status', 'doctor'];
export function parseDatabaseArgs(args: string[]): {
  command: DatabaseCommand;
  target: DatabaseTarget;
} {
  const [command, ...rest] = args;
  if (!COMMANDS.includes(command as DatabaseCommand)) throw new Error('INVALID_ARGUMENTS');
  if (rest.join(' ') === '--target local-test') {
    if (command === 'bootstrap') throw new Error('INVALID_ARGUMENTS');
    return { command: command as DatabaseCommand, target: { kind: 'local-test' } };
  }
  const [flag, purpose, confirmFlag, host, ...extra] = rest;
  if (
    flag !== '--target' ||
    (purpose !== 'staging' && purpose !== 'production') ||
    confirmFlag !== '--confirm-host' ||
    !host
  )
    throw new Error('INVALID_ARGUMENTS');
  const confirmed = extra.length === 1 && extra[0] === '--confirm-production';
  if (purpose === 'production' ? !confirmed : extra.length !== 0)
    throw new Error('INVALID_ARGUMENTS');
  return {
    command: command as DatabaseCommand,
    target: { kind: 'hosted', purpose, confirmHost: host },
  };
}
/** Deliberate refusals carry no secrets, so their codes are safe to show the operator. */
const REFUSALS = [
  'INVALID_ARGUMENTS',
  'MISSING_DATABASE_TARGET',
  'UNSAFE_DATABASE_TARGET',
  'UNCONFIRMED_DATABASE_HOST',
  'INHERITED_DATABASE_URL',
  'MISSING_LIBRARY_INSTANCE',
  'MISSING_DATABASE_MARKER',
  'UNSAFE_DATABASE_MARKER',
  'UNAPPROVED_DATABASE_BOOTSTRAP',
  'MIGRATION_HISTORY_DIVERGED',
  'MIGRATION_CHECKSUM_MISMATCH',
];
export function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return REFUSALS.includes(message)
    ? `DATABASE_OPERATION_FAILED: ${message}`
    : 'DATABASE_OPERATION_FAILED';
}
