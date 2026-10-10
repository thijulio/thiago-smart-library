import type { ReadingStatus, Platform } from './database-contracts';

/** Client-safe DTOs, independent of database and identity providers. */
export interface BookCard {
  stableId: string;
  title: string;
  authors: string[];
  genres: string[];
  status: ReadingStatus;
  platform: Platform;
  coverUrl: string | null;
  seriesName: string | null;
  seriesVolume: number | null;
  rating: number | null;
  finishedFrom: string | null;
  finishedTo: string | null;
  finishedPrecision: string;
}
export interface BookDetail extends BookCard {
  wordCount: number | null;
  opinion: string | null;
  notes: string | null;
  whyNext: string | null;
}
