/** Bigint identifiers and exact decimals cross JavaScript boundaries as strings. */
export type BookId = string;
export type StableBookId = string;
export type ReadingStatus =
  | 'read'
  | 'wishlist'
  | 'unread'
  | 'reading'
  | 'reread'
  | 'paused'
  | 'abandoned';
export type Platform = 'Audible' | 'Kindle' | 'Physical' | 'Unknown';
