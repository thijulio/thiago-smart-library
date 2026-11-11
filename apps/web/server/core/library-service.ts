import {
  isBookChange,
  isChangeProposal,
  isChangeReceipt,
  isEditableBook,
} from '@smart-library/domain';
import type { BookChange } from '@smart-library/domain';
export class LibraryServiceError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export const isRequestId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 500 && !v.includes('\0');
const statuses: Record<string, number> = {
  VERSION_CONFLICT: 409,
  REQUEST_REPLAY_MISMATCH: 409,
  PROPOSAL_DIGEST_MISMATCH: 409,
  NATIVE_WRITES_DISABLED: 403,
  BOOK_NOT_WRITABLE: 403,
  CONFIRMATION_REQUIRED: 403,
  PROPOSAL_NOT_FOUND: 404,
  BOOK_NOT_FOUND: 404,
  PROPOSAL_EXPIRED: 410,
  INVALID_BOOK_CHANGE: 400,
};
export function createLibraryService(pool: {
  query(sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}) {
  const invalid = () => {
    throw new LibraryServiceError('INVALID_REQUEST', 400);
  };
  async function call<T>(
    name: string,
    actor: string,
    args: unknown[],
    guard: (v: unknown) => v is T,
  ): Promise<T> {
    if (!identifier(actor)) invalid();
    try {
      const placeholders = [actor, ...args].map(
        (_, i) => '$' + (i + 1) + (name === 'prepare_book_change' && i === 2 ? '::jsonb' : ''),
      );
      const result = await pool.query(
        `SELECT library.${name}(${placeholders.join(',')}) AS result`,
        [actor, ...args],
      );
      const value = result.rows[0]?.result;
      if (value === null) throw new LibraryServiceError('NOT_FOUND', 404);
      if (!guard(value)) throw new LibraryServiceError('INVALID_STORED_RESULT', 503);
      return value;
    } catch (error) {
      if (error instanceof LibraryServiceError) throw error;
      const message = error instanceof Error ? error.message : '';
      if (Object.hasOwn(statuses, message))
        throw new LibraryServiceError(message, statuses[message]!);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0002')
        throw new LibraryServiceError('NOT_FOUND', 404);
      throw new LibraryServiceError('LIBRARY_UNAVAILABLE', 503);
    }
  }
  const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const books = (v: unknown): v is Record<string, unknown>[] =>
    Array.isArray(v) &&
    v.every((b) => record(b) && typeof b.stableId === 'string' && typeof b.title === 'string');
  const commit = (name: string, actor: string, requestId: string, id: string, digest: string) => {
    if (!isRequestId(requestId) || !isRequestId(id) || !/^[a-f0-9]{64}$/.test(digest)) invalid();
    return call(name, actor, [requestId, id, digest], isChangeReceipt);
  };
  return {
    async searchBooks(actor: string, query: string) {
      if (typeof query !== 'string' || query.length > 200) invalid();
      const values = await call('catalog_for_user', actor, [], books);
      const key = query.trim().toLocaleLowerCase();
      return values
        .filter((b) => JSON.stringify([b.title, b.authors]).toLocaleLowerCase().includes(key))
        .slice(0, 50);
    },
    async getBook(actor: string, id: string) {
      if (!identifier(id)) invalid();
      return call('book_for_user', actor, [id], record);
    },
    async listReading(actor: string) {
      return call('reading_for_user', actor, [], books);
    },
    async prepare(actor: string, requestId: string, change: BookChange, channel: 'site' | 'mcp') {
      if (!isRequestId(requestId) || !isBookChange(change) || !['site', 'mcp'].includes(channel))
        invalid();
      return call(
        'prepare_book_change',
        actor,
        [requestId, JSON.stringify(change), channel],
        isChangeProposal,
      );
    },
    async getProposal(actor: string, id: string) {
      if (!isRequestId(id)) invalid();
      return call('book_change_for_user', actor, [id], isChangeProposal);
    },
    async getEditableBook(actor: string, id: string) {
      if (!identifier(id)) invalid();
      return call('editable_book_for_user', actor, [id], isEditableBook);
    },
    async commit(actor: string, requestId: string, id: string, digest: string) {
      return commit('commit_book_change', actor, requestId, id, digest);
    },
    async confirmAndCommit(actor: string, requestId: string, id: string, digest: string) {
      return commit('confirm_and_commit_book_change', actor, requestId, id, digest);
    },
  };
}
export type LibraryService = ReturnType<typeof createLibraryService>;
