import { describe, expect, it } from 'vitest';
import { isStoredPlan, isStoredResult } from './ai-storage';

const metadata = {
  id: 'c5b5fbcc-09df-4c2b-9632-54b592b27531',
  revision: '9007199254740993',
  schemaVersion: 1,
  calculatedAt: '2026-11-06T12:00:00.000Z',
  inputFingerprint: 'a'.repeat(64),
  rubricVersion: 'synthetic-rubric-v1',
  producer: {
    kind: 'model',
    id: 'synthetic-producer',
    provider: 'synthetic-provider',
    model: 'synthetic-model',
    promptVersion: 'v1',
  },
};
const source = { reference: 'synthetic-source', revision: '1' };
function enrichment() {
  return {
    state: 'fresh',
    bookStableId: 'synthetic-book',
    kind: 'enrichment',
    revision: {
      ...structuredClone(metadata),
      payload: { description: 'Synthetic description', tags: ['mystery'], sources: [source] },
    },
  };
}
function plan() {
  return {
    state: 'fresh',
    platform: 'Kindle',
    revision: {
      ...structuredClone(metadata),
      entries: [
        {
          bookStableId: 'synthetic-book',
          position: 1,
          reason: 'Synthetic scheduling reason',
          evidence: [source],
          judgmentRevisionIds: [metadata.id],
        },
      ],
    },
  };
}
function setPath(value: object, path: string[], replacement: unknown) {
  let target = value as Record<string, unknown>;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[path[path.length - 1]] = replacement;
}

describe('stored AI result boundary', () => {
  it('distinguishes missing/unavailable from valid fresh and stale saved output', () => {
    expect(isStoredResult({ state: 'missing', kind: 'enrichment', bookStableId: 'book' })).toBe(
      true,
    );
    expect(isStoredResult({ state: 'unavailable', kind: 'enrichment', bookStableId: 'book' })).toBe(
      true,
    );
    expect(isStoredResult(enrichment())).toBe(true);
    expect(isStoredResult({ ...enrichment(), state: 'stale', reason: 'inputs_changed' })).toBe(
      true,
    );
    expect(isStoredResult({ ...enrichment(), state: 'stale' })).toBe(false);
    expect(isStoredResult({ ...enrichment(), state: 'missing' })).toBe(false);
    expect(isStoredResult({ ...enrichment(), state: 'unavailable' })).toBe(false);
  });

  it('rejects missing metadata, unsafe revision values and impossible timestamps', () => {
    for (const revision of [0, 1, '0', '-1', '01', '1.5', '9223372036854775808']) {
      const value = enrichment();
      Object.assign(value.revision, { revision });
      expect(isStoredResult(value)).toBe(false);
    }
    for (const calculatedAt of ['yesterday', '2026-02-30T12:00:00.000Z', '2026-11-06']) {
      const value = enrichment();
      value.revision.calculatedAt = calculatedAt;
      expect(isStoredResult(value)).toBe(false);
    }
    for (const field of Object.keys(metadata)) {
      const value = enrichment();
      delete (value.revision as Record<string, unknown>)[field];
      expect(isStoredResult(value)).toBe(false);
    }
    const value = enrichment();
    value.revision.inputFingerprint = 'not-a-hash';
    expect(isStoredResult(value)).toBe(false);
    expect(isStoredResult(null)).toBe(false);
    expect(isStoredResult({})).toBe(false);
  });

  it('validates source-backed enrichment and rejects unknown fields and excessive text', () => {
    const value = enrichment();
    value.revision.payload.sources = [];
    expect(isStoredResult(value)).toBe(false);
    expect(isStoredResult({ ...enrichment(), privateDebug: 'unexpected content' })).toBe(false);
    const oversized = enrichment();
    oversized.revision.payload.description = 'x'.repeat(20_001);
    expect(isStoredResult(oversized)).toBe(false);
  });

  it('preserves the declared taste scale rather than accepting nonfinite or out-of-range scores', () => {
    const value = {
      ...enrichment(),
      kind: 'taste',
      revision: {
        ...metadata,
        payload: {
          scores: [{ factor: 'synthetic-fit', value: 3, min: 1, max: 5 }],
          sources: [source],
        },
      },
    };
    expect(isStoredResult(value)).toBe(true);
    for (const score of [NaN, Infinity, -Infinity, 0, 6]) {
      expect(
        isStoredResult({
          ...value,
          revision: {
            ...value.revision,
            payload: {
              ...value.revision.payload,
              scores: [{ factor: 'fit', value: score, min: 1, max: 5 }],
            },
          },
        }),
      ).toBe(false);
    }
    expect(isStoredResult({ ...value, kind: 'enrichment' })).toBe(false);
  });

  it('rejects contradictory scales and duplicate factors instead of accepting ambiguous scores', () => {
    for (const scores of [
      [{ factor: 'fit', value: 3, min: 5, max: 1 }],
      [{ factor: 'fit', value: 3, min: 3, max: 3 }],
      [
        { factor: 'fit', value: 3, min: 1, max: 5 },
        { factor: 'fit', value: 4, min: 1, max: 5 },
      ],
    ]) {
      expect(
        isStoredResult({
          ...enrichment(),
          kind: 'taste',
          revision: { ...metadata, payload: { scores, sources: [source] } },
        }),
      ).toBe(false);
    }
  });

  it('keeps unknown format evidence explicit instead of fabricating a known edition judgment', () => {
    const value = {
      ...enrichment(),
      kind: 'format',
      revision: {
        ...metadata,
        payload: { judgments: [{ platform: 'Audible', state: 'unknown' }], sources: [source] },
      },
    };
    expect(isStoredResult(value)).toBe(true);
    const judged = {
      platform: 'Audible',
      state: 'known',
      editionReference: 'edition-1',
      suitability: 'suitable',
    };
    value.revision.payload.judgments = [judged];
    expect(isStoredResult(value)).toBe(true);
    value.revision.payload.judgments = [{ platform: 'Audible', state: 'known' }];
    expect(isStoredResult(value)).toBe(false);
  });
});

describe('stored platform plan boundary', () => {
  it('allows application-produced plan metadata without inventing a model call', () => {
    const value = plan();
    const producer = { kind: 'application', id: 'synthetic-planner', version: 'v1' };
    expect(
      isStoredPlan({
        ...value,
        revision: { ...value.revision, producer },
      }),
    ).toBe(true);
    expect(
      isStoredPlan({
        ...value,
        revision: { ...value.revision, producer: { ...producer, model: 'invented' } },
      }),
    ).toBe(false);
  });

  it('distinguishes absent plans from accepted empty plans and independently validates both platforms', () => {
    expect(isStoredPlan({ state: 'missing', platform: 'Kindle' })).toBe(true);
    expect(isStoredPlan({ state: 'unavailable', platform: 'Audible' })).toBe(true);
    const value = plan();
    expect(isStoredPlan(value)).toBe(true);
    value.revision.entries = [];
    expect(isStoredPlan(value)).toBe(true);
    expect(isStoredPlan({ ...value, platform: 'Audible' })).toBe(true);
    expect(isStoredPlan({ ...value, platform: 'Physical' })).toBe(false);
    expect(isStoredPlan({ ...value, state: 'missing' })).toBe(false);
  });

  it('rejects gaps, duplicates and ambiguous positions in stored plan order', () => {
    const value = plan();
    for (const position of [0, -1, 1.5, 2]) {
      value.revision.entries[0].position = position;
      expect(isStoredPlan(value)).toBe(false);
    }
    const entry = plan().revision.entries[0];
    value.revision.entries = [entry, { ...entry, position: 2 }];
    expect(isStoredPlan(value)).toBe(false);
    value.revision.entries = [entry, { ...entry, bookStableId: 'another-book', position: 1 }];
    expect(isStoredPlan(value)).toBe(false);
    value.revision.entries = [entry, { ...entry, bookStableId: 'another-book', position: 2 }];
    expect(isStoredPlan(value)).toBe(true);
  });
});

describe('persisted payload bounds', () => {
  it('accepts the documented text boundaries and rejects larger values', () => {
    for (const [path, max] of [
      [['bookStableId'], 500],
      [['revision', 'rubricVersion'], 200],
      [['revision', 'producer', 'id'], 200],
      [['revision', 'producer', 'provider'], 200],
      [['revision', 'producer', 'model'], 200],
      [['revision', 'producer', 'promptVersion'], 200],
      [['revision', 'payload', 'description'], 20_000],
      [['revision', 'payload', 'tags', '0'], 100],
      [['revision', 'payload', 'sources', '0', 'reference'], 2000],
    ] as [string[], number][]) {
      const accepted = structuredClone(enrichment());
      setPath(accepted, path, 'x'.repeat(max));
      expect(isStoredResult(accepted), path.join('.')).toBe(true);
      setPath(accepted, path, 'x'.repeat(max + 1));
      expect(isStoredResult(accepted), path.join('.')).toBe(false);
      setPath(accepted, path, ' ');
      expect(isStoredResult(accepted), path.join('.')).toBe(false);
    }
    for (const [path, max] of [
      [['revision', 'entries', '0', 'reason'], 4000],
      [['revision', 'entries', '0', 'bookStableId'], 500],
      [['revision', 'entries', '0', 'evidence', '0', 'reference'], 2000],
    ] as [string[], number][]) {
      const accepted = structuredClone(plan());
      setPath(accepted, path, 'x'.repeat(max));
      expect(isStoredPlan(accepted), path.join('.')).toBe(true);
      setPath(accepted, path, 'x'.repeat(max + 1));
      expect(isStoredPlan(accepted), path.join('.')).toBe(false);
    }
  });

  it('bounds source, tag, score, judgment and ordered-plan collections', () => {
    const value = structuredClone(enrichment());
    value.revision.payload.sources = Array.from({ length: 128 }, () => ({ ...source }));
    expect(isStoredResult(value)).toBe(true);
    value.revision.payload.sources.push({ ...source });
    expect(isStoredResult(value)).toBe(false);
    value.revision.payload.sources = [{ ...source, revision: '9223372036854775807' }];
    value.revision.payload.tags = Array.from({ length: 64 }, (_, i) => `tag-${i}`);
    expect(isStoredResult(value)).toBe(true);
    value.revision.payload.tags.push('extra');
    expect(isStoredResult(value)).toBe(false);
    const scores = Array.from({ length: 64 }, (_, i) => ({
      factor: `factor-${i}`,
      value: 1,
      min: 0,
      max: 2,
    }));
    const taste = {
      ...enrichment(),
      kind: 'taste',
      revision: { ...metadata, payload: { scores, sources: [source] } },
    };
    expect(isStoredResult(taste)).toBe(true);
    scores.push({ factor: 'extra', value: 1, min: 0, max: 2 });
    expect(isStoredResult(taste)).toBe(false);
    scores.pop();
    scores[0].factor = 'x'.repeat(200);
    expect(isStoredResult(taste)).toBe(true);
    scores[0].factor += 'x';
    expect(isStoredResult(taste)).toBe(false);
    const judgments = [
      {
        platform: 'Kindle',
        state: 'known',
        editionReference: 'x'.repeat(2000),
        suitability: 'mixed',
      },
      { platform: 'Audible', state: 'unknown' },
    ];
    const format = {
      ...enrichment(),
      kind: 'format',
      revision: { ...metadata, payload: { judgments, sources: [source] } },
    };
    expect(isStoredResult(format)).toBe(true);
    judgments[0].editionReference += 'x';
    expect(isStoredResult(format)).toBe(false);
    judgments[0].editionReference = 'edition';
    judgments.push({ platform: 'Physical', state: 'unknown' });
    expect(isStoredResult(format)).toBe(false);
    const saved = plan();
    const entry = saved.revision.entries[0];
    saved.revision.entries = Array.from({ length: 1000 }, (_, i) => ({
      ...entry,
      position: i + 1,
      bookStableId: `book-${i}`,
    }));
    expect(isStoredPlan(saved)).toBe(true);
    saved.revision.entries.push({ ...entry, position: 1001, bookStableId: 'extra' });
    expect(isStoredPlan(saved)).toBe(false);
  });

  it('bounds dependency evidence without losing unique valid revision references', () => {
    const saved = plan();
    const entry = saved.revision.entries[0];
    entry.evidence = Array.from({ length: 128 }, () => ({ ...source }));
    entry.judgmentRevisionIds = Array.from(
      { length: 128 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(isStoredPlan(saved)).toBe(true);
    entry.evidence.push({ ...source });
    expect(isStoredPlan(saved)).toBe(false);
    entry.evidence.pop();
    entry.judgmentRevisionIds.push('00000000-0000-4000-8000-999999999999');
    expect(isStoredPlan(saved)).toBe(false);
    entry.judgmentRevisionIds.pop();
    entry.judgmentRevisionIds[1] = entry.judgmentRevisionIds[0];
    expect(isStoredPlan(saved)).toBe(false);
  });
});
