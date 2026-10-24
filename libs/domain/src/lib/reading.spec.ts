import { describe, expect, it } from 'vitest';
import { groupReadingBooks, isReadingResponse, type ReadingBook } from './reading';
const book = (overrides: Partial<ReadingBook> = {}): ReadingBook => ({
  stableId: 'a',
  title: 'Example',
  authors: ['Author'],
  genres: [],
  status: 'unread',
  platform: 'Kindle',
  coverUrl: null,
  seriesName: null,
  seriesVolume: null,
  rating: null,
  finishedFrom: null,
  finishedTo: null,
  finishedPrecision: 'unknown',
  nextRank: null,
  nextSlot: null,
  whyNext: null,
  ...overrides,
});
describe('reading workspace', () => {
  it('includes current reading and rereads across every recorded platform', () => {
    const result = groupReadingBooks([
      book({ status: 'reading' }),
      book({ stableId: 'b', status: 'reread', platform: 'Physical' }),
      book({ stableId: 'c', status: 'reading', platform: 'Unknown' }),
      book({ status: 'paused' }),
    ]);
    expect(result.current.map((g) => g.label)).toEqual(['Kindle', 'Physical', 'Unknown']);
    expect(result.current.flatMap((g) => g.books)).toHaveLength(3);
  });
  it('requires explicit rank and eligible status, keeping platform and Kindle slots separate', () => {
    const result = groupReadingBooks([
      book({ nextRank: 2, nextSlot: 'Primary' }),
      book({ stableId: 'b', nextRank: 1, nextSlot: 'Secondary' }),
      book({ stableId: 'c', nextRank: 1 }),
      book({ stableId: 'd', nextRank: 1, platform: 'Audible', status: 'wishlist' }),
      book({ stableId: 'e', whyNext: 'A reason alone is not a choice' }),
      ...(['read', 'reading', 'reread', 'paused', 'abandoned'] as const).map((status) =>
        book({ status, nextRank: 1 }),
      ),
    ]);
    expect(result.queue.map((g) => g.label)).toEqual([
      'Kindle · Primary',
      'Kindle · Secondary',
      'Kindle · Slot unspecified',
      'Audible',
    ]);
    expect(result.queue.flatMap((g) => g.books)).toHaveLength(4);
  });
  it('retains tied ranks and all entries without modifying the input', () => {
    const rows = [
      book({ stableId: 'z', title: 'Z', nextRank: 1 }),
      book({ stableId: 'a', title: 'A', nextRank: 1 }),
      book({ stableId: 'd', nextRank: 4 }),
      book({ stableId: 'c', nextRank: 3 }),
    ];
    const original = structuredClone(rows);
    const group = groupReadingBooks(rows).queue[0]!;
    expect(group.books.map((b) => b.stableId)).toEqual(['a', 'z', 'c', 'd']);
    expect(group.hasTies).toBe(true);
    expect(rows).toEqual(original);
  });
  it('distinguishes valid empty responses from missing or malformed queue data', () => {
    expect(isReadingResponse({ queueState: 'available', books: [] })).toBe(true);
    expect(isReadingResponse({ queueState: 'available', books: [book()] })).toBe(true);
    for (const value of [
      null,
      {},
      { books: [] },
      { queueState: 'available', books: null },
      ...[undefined, 0, -1, 1.5, 32768, '1'].map((nextRank) => ({
        queueState: 'available',
        books: [book({ nextRank: nextRank as number })],
      })),
      { queueState: 'available', books: [book({ nextSlot: 'other' as 'Primary' })] },
      { queueState: 'available', books: [{ ...book(), authors: null }] },
    ])
      expect(isReadingResponse(value)).toBe(false);
  });
});
