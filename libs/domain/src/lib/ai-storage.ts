export type ResultKind = 'enrichment' | 'taste' | 'format';
export type StoredState = 'missing' | 'fresh' | 'stale' | 'unavailable';
export type PlanPlatform = 'Kindle' | 'Audible';
export type StaleReason = 'inputs_changed' | 'versions_changed' | 'source_unavailable';

export interface SourceReference {
  reference: string;
  revision: string | null;
}
export interface RubricScore {
  factor: string;
  value: number;
  min: number;
  max: number;
}
export type FormatJudgment =
  | { platform: PlanPlatform; state: 'unknown' }
  | {
      platform: PlanPlatform;
      state: 'known';
      editionReference: string;
      suitability: 'suitable' | 'unsuitable' | 'mixed';
    };
export interface ResultPayloads {
  enrichment: { description: string; tags: string[]; sources: SourceReference[] };
  taste: { scores: RubricScore[]; sources: SourceReference[] };
  format: { judgments: FormatJudgment[]; sources: SourceReference[] };
}
export type ProducerMetadata =
  | {
      kind: 'model';
      id: string;
      provider: string;
      model: string;
      promptVersion: string;
    }
  | { kind: 'application'; id: string; version: string };
export interface RevisionMetadata {
  id: string;
  /** Positive PostgreSQL bigint encoded without JavaScript precision loss. */
  revision: string;
  schemaVersion: 1;
  calculatedAt: string;
  inputFingerprint: string;
  rubricVersion: string;
  producer: ProducerMetadata;
}
type Saved<T> =
  | { state: 'missing' | 'unavailable' }
  | { state: 'fresh'; revision: T }
  | { state: 'stale'; reason: StaleReason; revision: T };
export type StoredResult = {
  [K in ResultKind]: { kind: K; bookStableId: string } & Saved<
    RevisionMetadata & { payload: ResultPayloads[K] }
  >;
}[ResultKind];
export interface PlanEntry {
  bookStableId: string;
  position: number;
  reason: string;
  evidence: SourceReference[];
  judgmentRevisionIds: string[];
}
export type StoredPlan = { platform: PlanPlatform } & Saved<
  RevisionMetadata & { entries: PlanEntry[] }
>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
const list = (
  value: unknown,
  check: (item: unknown) => boolean,
  max: number,
  min = 0,
): value is unknown[] =>
  Array.isArray(value) && value.length >= min && value.length <= max && value.every(check);
const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown) =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
const timestamp = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const platform = (value: unknown) => value === 'Kindle' || value === 'Audible';
const source = (value: unknown) =>
  record(value) &&
  keys(value, ['reference', 'revision']) &&
  text(value.reference, 2000) &&
  (value.revision === null || revision(value.revision));
const sources = (value: unknown) => list(value, source, 128, 1);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validProducer(value: unknown) {
  if (!record(value) || !text(value.id)) return false;
  if (value.kind === 'application')
    return keys(value, ['kind', 'id', 'version']) && text(value.version);
  return (
    value.kind === 'model' &&
    keys(value, ['kind', 'id', 'provider', 'model', 'promptVersion']) &&
    text(value.provider) &&
    text(value.model) &&
    text(value.promptVersion)
  );
}

function metadata(value: unknown, contents: 'payload' | 'entries') {
  if (!record(value)) return false;
  return (
    keys(value, [
      'id',
      'revision',
      'schemaVersion',
      'calculatedAt',
      'inputFingerprint',
      'rubricVersion',
      'producer',
      contents,
    ]) &&
    uuid(value.id) &&
    revision(value.revision) &&
    value.schemaVersion === 1 &&
    timestamp(value.calculatedAt) &&
    typeof value.inputFingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(value.inputFingerprint) &&
    text(value.rubricVersion) &&
    validProducer(value.producer)
  );
}
function score(value: unknown) {
  return (
    record(value) &&
    keys(value, ['factor', 'value', 'min', 'max']) &&
    text(value.factor) &&
    finite(value.value) &&
    finite(value.min) &&
    finite(value.max) &&
    value.min < value.max &&
    value.value >= value.min &&
    value.value <= value.max
  );
}
function formatJudgment(value: unknown) {
  if (!record(value) || !platform(value.platform)) return false;
  if (value.state === 'unknown') return keys(value, ['platform', 'state']);
  return (
    value.state === 'known' &&
    keys(value, ['platform', 'state', 'editionReference', 'suitability']) &&
    text(value.editionReference, 2000) &&
    ['suitable', 'unsuitable', 'mixed'].includes(value.suitability as string)
  );
}
function payload(kind: unknown, value: unknown) {
  if (!record(value) || !sources(value.sources)) return false;
  if (kind === 'enrichment')
    return (
      keys(value, ['description', 'tags', 'sources']) &&
      text(value.description, 20_000) &&
      list(value.tags, (tag) => text(tag, 100), 64)
    );
  if (kind === 'taste')
    return (
      keys(value, ['scores', 'sources']) &&
      list(value.scores, score, 64, 1) &&
      new Set(value.scores.map((item) => (item as RubricScore).factor)).size === value.scores.length
    );
  if (kind === 'format')
    return (
      keys(value, ['judgments', 'sources']) &&
      list(value.judgments, formatJudgment, 2, 1) &&
      new Set(value.judgments.map((item) => (item as FormatJudgment).platform)).size ===
        value.judgments.length
    );
  return false;
}
function envelope(value: Record<string, unknown>, identity: string[]) {
  if (value.state === 'missing' || value.state === 'unavailable')
    return keys(value, ['state', ...identity]);
  if (value.state === 'fresh') return keys(value, ['state', ...identity, 'revision']);
  return (
    value.state === 'stale' &&
    keys(value, ['state', ...identity, 'revision', 'reason']) &&
    ['inputs_changed', 'versions_changed', 'source_unavailable'].includes(value.reason as string)
  );
}
/** Validate saved JSON; ownership and freshness must still be checked on the server. */
export function isStoredResult(value: unknown): value is StoredResult {
  if (
    !record(value) ||
    !text(value.bookStableId, 500) ||
    !['enrichment', 'taste', 'format'].includes(value.kind as string) ||
    !envelope(value, ['bookStableId', 'kind'])
  )
    return false;
  if (value.state === 'missing' || value.state === 'unavailable') return true;
  return (
    metadata(value.revision, 'payload') &&
    record(value.revision) &&
    payload(value.kind, value.revision.payload)
  );
}
function entry(value: unknown) {
  return (
    record(value) &&
    keys(value, ['bookStableId', 'position', 'reason', 'evidence', 'judgmentRevisionIds']) &&
    text(value.bookStableId, 500) &&
    Number.isSafeInteger(value.position) &&
    (value.position as number) > 0 &&
    text(value.reason, 4000) &&
    sources(value.evidence) &&
    list(value.judgmentRevisionIds, uuid, 128) &&
    new Set(value.judgmentRevisionIds).size === value.judgmentRevisionIds.length
  );
}
export function isStoredPlan(value: unknown): value is StoredPlan {
  if (!record(value) || !platform(value.platform) || !envelope(value, ['platform'])) return false;
  if (value.state === 'missing' || value.state === 'unavailable') return true;
  if (
    !metadata(value.revision, 'entries') ||
    !record(value.revision) ||
    !list(value.revision.entries, entry, 1000)
  )
    return false;
  const entries = value.revision.entries as PlanEntry[];
  return (
    entries.every((item, index) => item.position === index + 1) &&
    new Set(entries.map((item) => item.bookStableId)).size === entries.length
  );
}
