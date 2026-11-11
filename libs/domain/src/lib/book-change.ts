/** The only conversational book mutations accepted by the shared API and MCP. */
export type BookPlatform = 'Audible' | 'Kindle' | 'Physical' | 'Unknown';
export type BookChangeStatus = 'wishlist' | 'unread' | 'reading' | 'paused' | 'read';
export type BookChangeFields = {
  platform?: BookPlatform;
  status?: BookChangeStatus;
  rating?: number | null;
  opinion?: string | null;
  notes?: string | null;
  finishedDate?: string | null;
};
export type BookChange =
  | ({
      type: 'create';
      title: string;
      authors: string[];
      platform: BookPlatform;
      status: BookChangeStatus;
    } & BookChangeFields)
  | {
      type: 'update';
      stableId: string;
      expectedVersion: string;
      expectedFeedbackVersion: string | null;
      patch: BookChangeFields;
    };
export type EditableBook = {
  stableId: string;
  title: string;
  authors: string[];
  platform: BookPlatform;
  status: BookChangeStatus | 'reread' | 'abandoned';
  rating: number | null;
  opinion: string | null;
  notes: string | null;
  finishedDate: string | null;
  version: string;
  feedbackVersion: string | null;
  native: boolean;
  writable: boolean;
};
export type ChangeReceipt = {
  proposalId: string;
  stableId: string;
  version: string;
  feedbackVersion: string | null;
  appliedAt: string;
  changed: boolean;
};
export type ChangeProposal = {
  id: string;
  digest: string;
  change: BookChange;
  before: EditableBook | null;
  expiresAt: string;
  state: 'pending' | 'expired' | 'committed';
  receipt: ChangeReceipt | null;
};
type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: RecordValue, required: string[], optional: string[] = []): boolean =>
  required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && v.trim().length > 0 && !v.includes('\0');
const nullableText = (v: unknown, max: number): boolean =>
  v === null || (typeof v === 'string' && v.length <= max && !v.includes('\0'));
const counter = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;
const platform = (v: unknown): v is BookPlatform =>
  ['Audible', 'Kindle', 'Physical', 'Unknown'].includes(v as string);
const status = (v: unknown): v is BookChangeStatus =>
  ['wishlist', 'unread', 'reading', 'paused', 'read'].includes(v as string);
const rating = (v: unknown): boolean =>
  v === null ||
  (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5 && Number.isInteger(v * 2));
const date = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v) || v.startsWith('0000'))
    return false;
  const parsed = new Date(v + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const fieldKeys = ['platform', 'status', 'rating', 'opinion', 'notes', 'finishedDate'];
function fields(v: RecordValue): boolean {
  return (
    (!Object.hasOwn(v, 'platform') || platform(v.platform)) &&
    (!Object.hasOwn(v, 'status') || status(v.status)) &&
    (!Object.hasOwn(v, 'rating') || rating(v.rating)) &&
    (!Object.hasOwn(v, 'opinion') || nullableText(v.opinion, 4000)) &&
    (!Object.hasOwn(v, 'notes') || nullableText(v.notes, 10000)) &&
    (!Object.hasOwn(v, 'finishedDate') || v.finishedDate === null || date(v.finishedDate)) &&
    (!(typeof v.finishedDate === 'string' && Object.hasOwn(v, 'status')) || v.status === 'read')
  );
}
export function isBookChange(v: unknown): v is BookChange {
  if (!object(v)) return false;
  try {
    if (new TextEncoder().encode(JSON.stringify(v)).length > 32768) return false;
  } catch {
    return false;
  }
  if (v.type === 'create') {
    if (
      !keys(
        v,
        ['type', 'title', 'authors', 'platform', 'status'],
        ['rating', 'opinion', 'notes', 'finishedDate'],
      ) ||
      !text(v.title, 500) ||
      !Array.isArray(v.authors) ||
      v.authors.length < 1 ||
      v.authors.length > 16 ||
      !v.authors.every((a) => text(a, 200)) ||
      !fields(v)
    )
      return false;
    const names = v.authors.map((a) => a.trim().normalize('NFC').toLowerCase());
    return new Set(names).size === names.length;
  }
  return (
    v.type === 'update' &&
    keys(v, ['type', 'stableId', 'expectedVersion', 'expectedFeedbackVersion', 'patch']) &&
    text(v.stableId, 500) &&
    counter(v.expectedVersion) &&
    (v.expectedFeedbackVersion === null || counter(v.expectedFeedbackVersion)) &&
    object(v.patch) &&
    keys(v.patch, [], fieldKeys) &&
    Object.keys(v.patch).length > 0 &&
    fields(v.patch)
  );
}
export function isEditableBook(v: unknown): v is EditableBook {
  return (
    object(v) &&
    keys(v, [
      'stableId',
      'title',
      'authors',
      'platform',
      'status',
      'rating',
      'opinion',
      'notes',
      'finishedDate',
      'version',
      'feedbackVersion',
      'native',
      'writable',
    ]) &&
    text(v.stableId, 500) &&
    text(v.title, 500) &&
    Array.isArray(v.authors) &&
    v.authors.length > 0 &&
    v.authors.every((a) => text(a, 200)) &&
    platform(v.platform) &&
    (status(v.status) || ['reread', 'abandoned'].includes(v.status as string)) &&
    (v.rating === null ||
      (typeof v.rating === 'number' &&
        Number.isFinite(v.rating) &&
        v.rating >= 0 &&
        v.rating <= 5)) &&
    nullableText(v.opinion, 4000) &&
    nullableText(v.notes, 10000) &&
    (v.finishedDate === null || date(v.finishedDate)) &&
    counter(v.version) &&
    (v.feedbackVersion === null || counter(v.feedbackVersion)) &&
    typeof v.native === 'boolean' &&
    typeof v.writable === 'boolean'
  );
}
export function isChangeReceipt(v: unknown): v is ChangeReceipt {
  return (
    object(v) &&
    keys(v, ['proposalId', 'stableId', 'version', 'feedbackVersion', 'appliedAt', 'changed']) &&
    uuid(v.proposalId) &&
    text(v.stableId, 500) &&
    counter(v.version) &&
    (v.feedbackVersion === null || counter(v.feedbackVersion)) &&
    timestamp(v.appliedAt) &&
    typeof v.changed === 'boolean'
  );
}
export function isChangeProposal(v: unknown): v is ChangeProposal {
  return (
    object(v) &&
    keys(v, ['id', 'digest', 'change', 'before', 'expiresAt', 'state', 'receipt']) &&
    uuid(v.id) &&
    typeof v.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    isBookChange(v.change) &&
    (v.before === null || isEditableBook(v.before)) &&
    timestamp(v.expiresAt) &&
    ['pending', 'expired', 'committed'].includes(v.state as string) &&
    (v.receipt === null || isChangeReceipt(v.receipt)) &&
    (v.state === 'committed' ? v.receipt !== null : v.receipt === null)
  );
}
