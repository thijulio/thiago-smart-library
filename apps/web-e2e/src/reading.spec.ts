import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = {
  title: 'Synthetic book',
  authors: ['Example Author'],
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
};
const rows = [
  { ...base, stableId: 'current', title: 'Current Kindle', status: 'reading' },
  { ...base, stableId: 'again', title: 'Physical Reread', status: 'reread', platform: 'Physical' },
  {
    ...base,
    stableId: 'first',
    title: 'First Choice',
    nextRank: 1,
    nextSlot: 'Primary',
    whyNext: 'Continue this series',
  },
  { ...base, stableId: 'tied', title: 'Tied Choice', nextRank: 1, nextSlot: 'Primary' },
  { ...base, stableId: 'secondary', title: 'Secondary Choice', nextRank: 1, nextSlot: 'Secondary' },
  { ...base, stableId: 'unspecified', title: 'Unspecified Choice', nextRank: 1 },
  { ...base, stableId: 'audio', title: 'Audio Choice', platform: 'Audible', nextRank: 1 },
];
async function session(page: Page) {
  await page.route('**/api/private/session', (r) =>
    r.fulfill({ json: { user: { id: 'synthetic', name: 'Reader' } } }),
  );
}
test('reading preserves platforms, slots, ties and opens private details', async ({ page }) => {
  await session(page);
  await page.route('**/api/private/reading', (r) =>
    r.fulfill({ json: { queueState: 'available', books: rows } }),
  );
  await page.route('**/api/private/books/current', (r) =>
    r.fulfill({ json: { book: { ...rows[0], wordCount: null, opinion: null, notes: null } } }),
  );
  await page.route('**/api/private/books', (r) => r.fulfill({ json: { books: [] } }));
  await page.goto('/library');
  await page.getByRole('link', { name: 'Reading', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Reading', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Reading now', exact: true })).toBeVisible();
  for (const name of [
    'Kindle · Primary',
    'Kindle · Secondary',
    'Kindle · Slot unspecified',
    'Audible',
  ])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Continue this series')).toBeVisible();
  await expect(
    page.getByText('Some books share a rank; their relative order is not recorded.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Current Kindle/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/library\/books\/current$/);
  await expect(page.getByRole('heading', { name: 'Current Kindle', exact: true })).toBeVisible();
});
test('distinguishes empty, missing, failed and recovered data', async ({ page }) => {
  await session(page);
  let mode = 'empty';
  await page.route('**/api/private/reading', (r) =>
    r.fulfill(
      mode === 'error'
        ? { status: 503, json: { error: 'Unavailable' } }
        : {
            json:
              mode === 'missing'
                ? { books: [] }
                : { queueState: 'available', books: mode === 'ready' ? rows : [] },
          },
    ),
  );
  await page.goto('/library/reading');
  await expect(page.getByText('No books currently in progress.')).toBeVisible();
  await expect(page.getByText('No Up Next choices recorded yet.')).toBeVisible();
  mode = 'missing';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Reading data unavailable' })).toBeVisible();
  await expect(page.getByText('No Up Next choices recorded yet.')).toHaveCount(0);
  mode = 'error';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your reading couldn’t load' })).toBeVisible();
  mode = 'ready';
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
});
test('loading is explicit and revoked sessions hide cached content', async ({ page }) => {
  await session(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/private/reading', async (r) => {
    await gate;
    await r.fulfill({ json: { queueState: 'available', books: rows } });
  });
  await page.goto('/library/reading');
  await expect(page.getByRole('status')).toContainText('Opening your reading');
  release();
  await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
  await page.route('**/api/private/reading', (r) =>
    r.fulfill({ status: 401, json: { error: 'Sign in required' } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/signin=required/);
  await expect(page.getByText('Current Kindle')).toHaveCount(0);
});
test('logout clears reading and anonymous APIs remain private', async ({ page, request }) => {
  const response = await request.get('/api/private/reading?userId=another');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
  const html = await request.get('/library/reading');
  expect(html.headers()['cache-control']).toContain('no-store');
  expect(await html.text()).not.toContain('Current Kindle');
  await session(page);
  await page.route('**/api/private/reading', (r) =>
    r.fulfill({ json: { queueState: 'available', books: rows } }),
  );
  await page.route('**/api/auth/sign-out', (r) => r.fulfill({ json: { success: true } }));
  await page.goto('/library/reading');
  await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Current Kindle')).toHaveCount(0);
});
