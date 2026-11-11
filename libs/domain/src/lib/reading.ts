import type { BookCard } from './library-contracts';
import type { Platform } from './database-contracts';

export interface ReadingBook extends BookCard {
  nextRank: number | null;
  nextSlot: 'Primary' | 'Secondary' | null;
  whyNext: string | null;
}
export interface ReadingResponse {
  queueState: 'available';
  books: ReadingBook[];
}
export interface ReadingGroup {
  label: string;
  books: ReadingBook[];
  hasTies: boolean;
}
const platforms: Platform[] = ['Kindle', 'Audible', 'Physical', 'Unknown'];
const statuses = ['read', 'wishlist', 'unread', 'reading', 'reread', 'paused', 'abandoned'];
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const nullableNumber = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value));
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Reject incomplete projections rather than disguising unavailable data as empty. */
export function isReadingResponse(value: unknown): value is ReadingResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return (
    response.queueState === 'available' &&
    Array.isArray(response.books) &&
    response.books.every((value: unknown) => {
      if (!value || typeof value !== 'object') return false;
      const b = value as Record<string, unknown>;
      return (
        typeof b.stableId === 'string' &&
        b.stableId.length > 0 &&
        typeof b.title === 'string' &&
        strings(b.authors) &&
        strings(b.genres) &&
        statuses.includes(b.status as string) &&
        platforms.includes(b.platform as Platform) &&
        nullableText(b.coverUrl) &&
        nullableText(b.seriesName) &&
        nullableNumber(b.seriesVolume) &&
        nullableNumber(b.rating) &&
        nullableText(b.finishedFrom) &&
        nullableText(b.finishedTo) &&
        typeof b.finishedPrecision === 'string' &&
        nullableText(b.whyNext) &&
        (b.nextSlot === null || b.nextSlot === 'Primary' || b.nextSlot === 'Secondary') &&
        (b.nextRank === null ||
          (typeof b.nextRank === 'number' &&
            Number.isInteger(b.nextRank) &&
            b.nextRank > 0 &&
            b.nextRank <= 32767))
      );
    })
  );
}
const displayOrder = (a: ReadingBook, b: ReadingBook) =>
  a.title.localeCompare(b.title, 'en') || a.stableId.localeCompare(b.stableId, 'en');

export function groupReadingBooks(books: ReadingBook[]): {
  current: ReadingGroup[];
  queue: ReadingGroup[];
} {
  const current: ReadingGroup[] = [];
  const queue: ReadingGroup[] = [];
  for (const platform of platforms) {
    const rows = books.filter((b) => b.platform === platform);
    const active = rows
      .filter((b) => b.status === 'reading' || b.status === 'reread')
      .sort(displayOrder);
    if (active.length) current.push({ label: platform, books: active, hasTies: false });
    const selected = rows.filter(
      (b) =>
        b.nextRank !== null && b.nextRank > 0 && (b.status === 'unread' || b.status === 'wishlist'),
    );
    const slots = platform === 'Kindle' ? (['Primary', 'Secondary', null] as const) : [null];
    for (const slot of slots) {
      const entries = selected
        .filter((b) => platform !== 'Kindle' || b.nextSlot === slot)
        .sort((a, b) => a.nextRank! - b.nextRank! || displayOrder(a, b));
      if (entries.length)
        queue.push({
          label: platform === 'Kindle' ? `Kindle · ${slot ?? 'Slot unspecified'}` : platform,
          books: entries,
          hasTies: new Set(entries.map((b) => b.nextRank)).size !== entries.length,
        });
    }
  }
  return { current, queue };
}
