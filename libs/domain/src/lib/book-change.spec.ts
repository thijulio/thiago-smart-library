import { expect, it } from 'vitest';
import { isBookChange, isChangeProposal, isChangeReceipt, isEditableBook } from './book-change';
const create = {
  type: 'create',
  title: 'Synthetic',
  authors: ['Writer'],
  platform: 'Kindle',
  status: 'unread',
};
it('accepts the closed create and versioned update contract', () => {
  expect(isBookChange(create)).toBe(true);
  expect(
    isBookChange({
      type: 'update',
      stableId: 'book',
      expectedVersion: '1',
      expectedFeedbackVersion: null,
      patch: { rating: 3.5, notes: null },
    }),
  ).toBe(true);
});
it('rejects unknown keys, duplicates, invalid versions and empty patches', () => {
  for (const change of [
    { ...create, owner: 'foreign' },
    { ...create, authors: ['Writer', ' writer '] },
    { ...create, status: 'reread' },
    { ...create, rating: 3.1 },
    { ...create, rating: 0 },
    { ...create, title: ' ' },
    { ...create, notes: 'x'.repeat(10001) },
    {
      type: 'update',
      stableId: 'b',
      expectedVersion: '9223372036854775808',
      expectedFeedbackVersion: null,
      patch: { status: 'read' },
    },
    {
      type: 'update',
      stableId: 'b',
      expectedVersion: '1',
      expectedFeedbackVersion: null,
      patch: {},
    },
  ])
    expect(isBookChange(change)).toBe(false);
});
it('validates absolute dates and requires read status for a supplied date', () => {
  expect(isBookChange({ ...create, status: 'read', finishedDate: '2024-02-29' })).toBe(true);
  for (const finishedDate of ['2023-02-29', '2024-13-01', '2024-04-31', '0000-01-01'])
    expect(isBookChange({ ...create, status: 'read', finishedDate })).toBe(false);
  expect(isBookChange({ ...create, finishedDate: '2024-01-01' })).toBe(false);
  expect(
    isBookChange({
      type: 'update',
      stableId: 'b',
      expectedVersion: '1',
      expectedFeedbackVersion: null,
      patch: { finishedDate: '2024-01-01' },
    }),
  ).toBe(true);
});
it('checks strict stored projection shapes', () => {
  const book = {
    stableId: 'b',
    title: 'Synthetic',
    authors: ['Writer'],
    platform: 'Kindle',
    status: 'unread',
    rating: null,
    opinion: null,
    notes: null,
    finishedDate: null,
    version: '1',
    feedbackVersion: null,
    native: true,
    writable: true,
  };
  const receipt = {
    proposalId: '123e4567-e89b-42d3-a456-426614174000',
    stableId: 'b',
    version: '1',
    feedbackVersion: null,
    appliedAt: '2026-11-11T12:00:00.000Z',
    changed: true,
  };
  expect(isEditableBook(book)).toBe(true);
  expect(isChangeReceipt(receipt)).toBe(true);
  expect(
    isChangeProposal({
      id: receipt.proposalId,
      digest: 'a'.repeat(64),
      change: create,
      before: null,
      expiresAt: receipt.appliedAt,
      state: 'pending',
      receipt: null,
    }),
  ).toBe(true);
  expect(isEditableBook({ ...book, foreign: true })).toBe(false);
  expect(isChangeReceipt({ ...receipt, version: 1 })).toBe(false);
});
