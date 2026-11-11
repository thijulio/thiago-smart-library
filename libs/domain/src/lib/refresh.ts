import type { PlanPlatform, ResultKind } from './ai-storage';

export type RefreshTarget =
  | { type: 'result'; bookStableId: string; kind: ResultKind }
  | { type: 'plan'; platform: PlanPlatform };
export type RefreshRequest = {
  libraryId: string;
  target: RefreshTarget;
  inputFingerprint: string;
  retryFailed?: boolean;
};
export type RefreshJob = Readonly<{
  key: string;
  libraryId: string;
  target: Readonly<RefreshTarget>;
  inputFingerprint: string;
  generation: string;
  status: 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed';
  attempts: number;
  availableAt: number;
  leaseUntil: number | null;
}>;
export type RefreshClaim = Readonly<{
  key: string;
  generation: string;
  inputFingerprint: string;
  attempt: number;
}>;
export type RefreshOutcome = 'succeeded' | 'retryable_failure' | 'permanent_failure';

const leaseMs = 60_000;
const maxAttempts = 3;
const maxGeneration = 9223372036854775807n;

function assertTime(now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - leaseMs)
    throw new Error('INVALID_REFRESH_TIME');
}
function nextGeneration(generation: string): string {
  if (!/^[1-9][0-9]{0,18}$/.test(generation) || BigInt(generation) >= maxGeneration)
    throw new Error('REFRESH_GENERATION_EXHAUSTED');
  return (BigInt(generation) + 1n).toString();
}
function requestKey(request: RefreshRequest): string {
  const { libraryId, target, inputFingerprint } = request;
  if (!libraryId || libraryId.length > 200 || !/^[a-f0-9]{64}$/.test(inputFingerprint))
    throw new Error('INVALID_REFRESH_REQUEST');
  if (target.type === 'result') {
    if (
      !target.bookStableId ||
      target.bookStableId.length > 500 ||
      !['enrichment', 'taste', 'format'].includes(target.kind)
    )
      throw new Error('INVALID_REFRESH_REQUEST');
    return JSON.stringify([libraryId, 'result', target.bookStableId, target.kind]);
  }
  if (target.type !== 'plan' || !['Kindle', 'Audible'].includes(target.platform))
    throw new Error('INVALID_REFRESH_REQUEST');
  return JSON.stringify([libraryId, 'plan', target.platform]);
}

/** Pure policy only: callers must authorize, validate snapshots and serialize persistence. */
export function enqueueRefresh(
  current: RefreshJob | null,
  request: RefreshRequest,
  now: number,
): RefreshJob {
  assertTime(now);
  const key = requestKey(request);
  if (current && current.key !== key) throw new Error('REFRESH_SCOPE_MISMATCH');
  if (
    current &&
    current.inputFingerprint === request.inputFingerprint &&
    !(current.status === 'failed' && request.retryFailed === true)
  )
    return current;
  return {
    key,
    libraryId: request.libraryId,
    target: { ...request.target },
    inputFingerprint: request.inputFingerprint,
    generation: current ? nextGeneration(current.generation) : '1',
    status: 'queued',
    attempts: 0,
    availableAt: now,
    leaseUntil: null,
  };
}

export function claimRefresh(
  job: RefreshJob,
  now: number,
): { job: RefreshJob; claim: RefreshClaim | null } {
  assertTime(now);
  if (
    job.status === 'failed' ||
    job.status === 'succeeded' ||
    now < job.availableAt ||
    (job.status === 'running' && job.leaseUntil !== null && now < job.leaseUntil)
  )
    return { job, claim: null };
  if (job.attempts >= maxAttempts)
    return { job: { ...job, status: 'failed', leaseUntil: null }, claim: null };
  const attempts = job.attempts + 1;
  return {
    job: { ...job, status: 'running', attempts, availableAt: now, leaseUntil: now + leaseMs },
    claim: {
      key: job.key,
      generation: job.generation,
      inputFingerprint: job.inputFingerprint,
      attempt: attempts,
    },
  };
}

export function finishRefresh(
  job: RefreshJob,
  claim: RefreshClaim,
  outcome: RefreshOutcome,
  now: number,
): RefreshJob {
  assertTime(now);
  if (
    job.status !== 'running' ||
    job.leaseUntil === null ||
    now >= job.leaseUntil ||
    now < job.availableAt ||
    claim.key !== job.key ||
    claim.generation !== job.generation ||
    claim.inputFingerprint !== job.inputFingerprint ||
    claim.attempt !== job.attempts
  )
    return job;
  if (outcome === 'succeeded') return { ...job, status: 'succeeded', leaseUntil: null };
  if (outcome === 'permanent_failure' || job.attempts >= maxAttempts)
    return { ...job, status: 'failed', leaseUntil: null };
  return {
    ...job,
    status: 'retry_wait',
    leaseUntil: null,
    availableAt: now + (job.attempts === 1 ? 1000 : 5000),
  };
}
