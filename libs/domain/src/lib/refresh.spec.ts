import { describe, expect, it } from 'vitest';
import { claimRefresh, enqueueRefresh, finishRefresh } from './refresh';
import type { RefreshRequest } from './refresh';

const request: RefreshRequest = {
  libraryId: 'synthetic-library',
  target: { type: 'result', bookStableId: 'synthetic-book', kind: 'taste' },
  inputFingerprint: 'a'.repeat(64),
};
function start() {
  return claimRefresh(enqueueRefresh(null, request, 0), 0);
}

describe('refresh lifecycle', () => {
  it('coalesces identical work before, during and after calculation', () => {
    const queued = enqueueRefresh(null, request, 0);
    expect(enqueueRefresh(queued, request, 10)).toEqual(queued);
    const running = claimRefresh(queued, 10);
    expect(running.claim).not.toBeNull();
    expect(enqueueRefresh(running.job, request, 20)).toEqual(running.job);
    const done = finishRefresh(running.job, running.claim!, 'succeeded', 30);
    expect(done.status).toBe('succeeded');
    expect(enqueueRefresh(done, request, 40)).toEqual(done);
    expect(claimRefresh(done, 50).claim).toBeNull();
  });

  it('supersedes an in-flight calculation when its input changes', () => {
    const running = start();
    const newer = enqueueRefresh(running.job, { ...request, inputFingerprint: 'b'.repeat(64) }, 20);
    expect(newer).toMatchObject({ generation: '2', attempts: 0, status: 'queued' });
    expect(finishRefresh(newer, running.claim!, 'succeeded', 30)).toEqual(newer);
    const current = claimRefresh(newer, 30);
    expect(finishRefresh(current.job, current.claim!, 'succeeded', 40).status).toBe('succeeded');
  });

  it('distinguishes library, result kind, book and independent platform targets', () => {
    const variants: RefreshRequest[] = [
      request,
      { ...request, libraryId: 'other-library' },
      { ...request, target: { type: 'result', bookStableId: 'other-book', kind: 'taste' } },
      { ...request, target: { type: 'result', bookStableId: 'synthetic-book', kind: 'format' } },
      { ...request, target: { type: 'plan', platform: 'Kindle' } },
      { ...request, target: { type: 'plan', platform: 'Audible' } },
    ];
    const jobs = variants.map((value) => enqueueRefresh(null, value, 0));
    expect(new Set(jobs.map((job) => job.key)).size).toBe(6);
    expect(() => enqueueRefresh(jobs[0], variants[1], 0)).toThrow();
    const foreign = claimRefresh(jobs[1], 0);
    const local = claimRefresh(jobs[0], 0);
    expect(finishRefresh(local.job, foreign.claim!, 'succeeded', 1)).toEqual(local.job);
  });

  it('does not collide when identifiers contain separators', () => {
    const one = enqueueRefresh(
      null,
      {
        ...request,
        libraryId: 'a:b',
        target: {
          type: 'result',
          bookStableId: 'c',
          kind: 'taste',
        },
      },
      0,
    );
    const two = enqueueRefresh(
      null,
      {
        ...request,
        libraryId: 'a',
        target: {
          type: 'result',
          bookStableId: 'b:c',
          kind: 'taste',
        },
      },
      0,
    );
    expect(one.key).not.toBe(two.key);
  });

  it('reclaims an expired lease and rejects the previous attempt', () => {
    const first = start();
    expect(claimRefresh(first.job, 59_999).claim).toBeNull();
    expect(finishRefresh(first.job, first.claim!, 'succeeded', 60_000)).toEqual(first.job);
    const second = claimRefresh(first.job, 60_000);
    expect(second.claim?.attempt).toBe(2);
    expect(finishRefresh(second.job, first.claim!, 'succeeded', 60_001)).toEqual(second.job);
    expect(finishRefresh(second.job, second.claim!, 'succeeded', 60_001).status).toBe('succeeded');
  });

  it('bounds retry attempts and waits before retrying', () => {
    const first = start();
    const waiting = finishRefresh(first.job, first.claim!, 'retryable_failure', 10);
    expect(waiting).toMatchObject({ status: 'retry_wait', availableAt: 1010 });
    expect(claimRefresh(waiting, 1009).claim).toBeNull();
    const second = claimRefresh(waiting, 1010);
    expect(second.claim?.attempt).toBe(2);
    const waitingAgain = finishRefresh(second.job, second.claim!, 'retryable_failure', 1020);
    expect(waitingAgain.availableAt).toBe(6020);
    expect(claimRefresh(waitingAgain, 6019).claim).toBeNull();
    const third = claimRefresh(waitingAgain, 6020);
    expect(third.claim?.attempt).toBe(3);
    const failed = finishRefresh(third.job, third.claim!, 'retryable_failure', 6030);
    expect(failed.status).toBe('failed');
    expect(claimRefresh(failed, 1_000_000).claim).toBeNull();
    expect(enqueueRefresh(failed, request, 1_000_000)).toEqual(failed);
    const retried = enqueueRefresh(failed, { ...request, retryFailed: true }, 1_000_000);
    expect(retried).toMatchObject({ generation: '2', attempts: 0, status: 'queued' });
    expect(claimRefresh(retried, 1_000_000).claim?.attempt).toBe(1);
  });

  it('exhausts abandoned leases without an unbounded fourth attempt', () => {
    const one = start();
    const two = claimRefresh(one.job, 60_000);
    const three = claimRefresh(two.job, 120_000);
    const exhausted = claimRefresh(three.job, 180_000);
    expect(exhausted.claim).toBeNull();
    expect(exhausted.job).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('fails permanent errors immediately and ignores duplicate completion', () => {
    const running = start();
    const failed = finishRefresh(running.job, running.claim!, 'permanent_failure', 1);
    expect(failed.status).toBe('failed');
    expect(claimRefresh(failed, 2).claim).toBeNull();
    expect(finishRefresh(failed, running.claim!, 'succeeded', 2)).toEqual(failed);
    const succeeded = finishRefresh(running.job, running.claim!, 'succeeded', 1);
    expect(finishRefresh(succeeded, running.claim!, 'retryable_failure', 2)).toEqual(succeeded);
  });

  it('continues from a persisted JSON snapshot without retaining process state', () => {
    const first = start();
    const restored = JSON.parse(JSON.stringify(first.job));
    expect(claimRefresh(restored, 1).claim).toBeNull();
    const reclaimed = claimRefresh(restored, 60_000);
    expect(reclaimed.claim?.attempt).toBe(2);
    expect(finishRefresh(reclaimed.job, reclaimed.claim!, 'succeeded', 60_001).status).toBe(
      'succeeded',
    );
  });

  it('rejects mismatched input fingerprints in claims', () => {
    const running = start();
    expect(
      finishRefresh(
        running.job,
        { ...running.claim!, inputFingerprint: 'b'.repeat(64) },
        'succeeded',
        1,
      ),
    ).toEqual(running.job);
  });

  it('does not mutate inputs or retain a caller-owned target', () => {
    const input = structuredClone(request);
    const queued = enqueueRefresh(null, input, 0);
    const snapshot = structuredClone(queued);
    const running = claimRefresh(queued, 1);
    finishRefresh(running.job, running.claim!, 'retryable_failure', 2);
    expect(queued).toEqual(snapshot);
    if (input.target.type === 'result') input.target.bookStableId = 'changed';
    expect(queued.target).toEqual(request.target);
  });

  it('rejects unsafe times, invalid fingerprints and exhausted generation counters', () => {
    for (const now of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => enqueueRefresh(null, request, now)).toThrow();
    }
    for (const inputFingerprint of ['', 'A'.repeat(64), 'a'.repeat(63)]) {
      expect(() => enqueueRefresh(null, { ...request, inputFingerprint }, 0)).toThrow();
    }
    const queued = enqueueRefresh(null, request, 0);
    expect(() =>
      enqueueRefresh(
        { ...queued, generation: '9223372036854775807' },
        { ...request, inputFingerprint: 'b'.repeat(64) },
        1,
      ),
    ).toThrow();
    const huge = enqueueRefresh(
      { ...queued, generation: '9007199254740993' },
      { ...request, inputFingerprint: 'b'.repeat(64) },
      1,
    );
    expect(huge.generation).toBe('9007199254740994');
  });
});
