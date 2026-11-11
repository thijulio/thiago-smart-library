import { expect, test } from '@playwright/test';
const id = 'fce29940-34bf-4823-9527-9eae29fdfc37';
const digest = 'a'.repeat(64);
const proposal = {
  id,
  digest,
  change: {
    type: 'update',
    stableId: 'synthetic',
    expectedVersion: '1',
    expectedFeedbackVersion: null,
    patch: { status: 'read', rating: null, notes: 'Exact approved note' },
  },
  before: {
    stableId: 'synthetic',
    title: 'Synthetic book',
    authors: ['Example Author'],
    platform: 'Kindle',
    status: 'reading',
    rating: 4,
    opinion: null,
    notes: 'Previous note',
    finishedDate: null,
    version: '1',
    feedbackVersion: null,
    native: true,
    writable: true,
  },
  expiresAt: '2099-01-01T00:00:00.000Z',
  state: 'pending',
  receipt: null,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/private/session', (r) =>
    r.fulfill({ json: { user: { id: 'synthetic', name: 'Reader' } } }),
  );
});
test('reviews exact values and retries approval with the same request and digest', async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route(`**/api/private/changes/${id}`, (r) => r.fulfill({ json: { proposal } }));
  await page.route(`**/api/private/changes/${id}/confirm`, (r) => {
    requests.push(r.request().postDataJSON());
    return requests.length === 1
      ? r.fulfill({ status: 503, json: { error: 'Unavailable' } })
      : r.fulfill({
          json: {
            receipt: {
              proposalId: id,
              stableId: 'synthetic',
              version: '2',
              feedbackVersion: '1',
              appliedAt: '2026-11-11T12:00:00.000Z',
              changed: true,
            },
          },
        });
  });
  await page.goto(`/library/changes/${id}`);
  await expect(page.getByRole('heading', { name: 'Synthetic book' })).toBeVisible();
  await expect(
    page.getByRole('row', { name: 'Notes Previous note Exact approved note' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: 'Rating 4 None' })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Approve and save' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await page.getByRole('button', { name: 'Approve and save' }).click();
  await expect(page.getByRole('heading', { name: 'Change saved' })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0]).toMatchObject({ digest });
});
test('expired proposals cannot be approved', async ({ page }) => {
  await page.route(`**/api/private/changes/${id}`, (r) =>
    r.fulfill({
      json: { proposal: { ...proposal, expiresAt: '2020-01-01T00:00:00.000Z', state: 'expired' } },
    }),
  );
  await page.goto(`/library/changes/${id}`);
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page.getByRole('button', { name: 'Approve and save' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/library');
});
