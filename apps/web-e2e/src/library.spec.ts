import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const books = [
  {
    stableId: 'synthetic-a',
    title: 'The First Chapter',
    authors: ['Example Author'],
    genres: ['Fantasy'],
    status: 'reading',
    platform: 'Kindle',
    coverUrl: null,
    seriesName: null,
    seriesVolume: null,
    rating: 4,
    finishedFrom: null,
    finishedTo: null,
    finishedPrecision: 'unknown',
  },
  {
    stableId: 'synthetic-b',
    title: 'Another Journey',
    authors: ['Second Author'],
    genres: [],
    status: 'read',
    platform: 'Physical',
    coverUrl: null,
    seriesName: 'Example Series',
    seriesVolume: 2,
    rating: null,
    finishedFrom: '2025-01-01',
    finishedTo: '2025-01-31',
    finishedPrecision: 'month',
  },
];
// UI fixtures only: actual signed-session and cross-user HTTP behavior is tested
// against disposable PostgreSQL in private-http.integration.spec.ts.
async function signedInUi(page: Page, rows = books) {
  await page.route('**/api/private/session', (route) =>
    route.fulfill({ json: { user: { id: 'synthetic-user', name: 'Example Reader' } } }),
  );
  await page.route('**/api/private/books', (route) => route.fulfill({ json: { books: rows } }));
  await page.route('**/api/private/books/synthetic-a', (route) =>
    route.fulfill({
      json: {
        book: {
          ...books[0],
          wordCount: 50000,
          opinion: 'A thoughtful story.',
          notes: 'Synthetic private note.',
          whyNext: null,
        },
      },
    }),
  );
}
test('public page describes the product without loading books and persists theme', async ({
  page,
}) => {
  let privateRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/private/')) privateRequests++;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your books.');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect(privateRequests).toBe(0);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});
test('anonymous private navigation redirects to sign-in', async ({ page, request }) => {
  await page.goto('/library');
  await expect(page).toHaveURL(/signin=required/);
  await expect(page.getByText('Sign in to open your library.')).toBeVisible();
  const response = await request.get('/api/private/books?userId=synthetic-owner');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
  const html = await request.get('/library');
  expect(html.headers()['cache-control']).toContain('no-store');
  expect(await html.text()).not.toContain('synthetic-owner');
});
test('renders books, filters and opens private details', async ({ page }, testInfo) => {
  await signedInUi(page);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your books' }).getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Search your library').fill('Second Author');
  await expect(page.getByRole('list', { name: 'Your books' }).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Search your library').clear();
  await page.getByLabel('Reading status').selectOption('reading');
  await expect(page.getByRole('list', { name: 'Your books' }).getByRole('listitem')).toHaveCount(1);
  const screenshot = testInfo.outputPath('private-library.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('private-library', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('link', { name: /The First Chapter/ }).click();
  await expect(page.getByRole('heading', { name: 'The First Chapter' })).toBeVisible();
  await expect(page.getByText('Synthetic private note.')).toBeVisible();
  await page.getByRole('link', { name: '← My library' }).click();
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
});
test('new readers see an empty library and logout clears private content', async ({ page }) => {
  await signedInUi(page, []);
  await page.route('**/api/auth/sign-out', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your library starts here' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Your library starts here' })).toHaveCount(0);
});
test('shows safe sign-in failure and private missing-book states', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in is temporarily unavailable');
  await signedInUi(page);
  await page.route('**/api/private/books/missing', (route) =>
    route.fulfill({ status: 404, json: { error: 'Book not found' } }),
  );
  await page.goto('/library/books/missing');
  await expect(page.getByRole('heading', { name: 'Book not found' })).toBeVisible();
});
test('layouts are accessible and fit a narrow viewport', async ({ page }) => {
  await signedInUi(page);
  for (const path of ['/', '/library', '/library/books/synthetic-a']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
test('built HTTP routing preserves health methods and API 404 responses', async ({ request }) => {
  expect(await (await request.get('/api/health')).json()).toEqual({ status: 'ok' });
  const rejected = await request.post('/api/health');
  expect(rejected.status()).toBe(405);
  expect(rejected.headers().allow).toBe('GET');
  const missing = await request.get('/api/missing');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: 'Not found' });
  expect((await request.get('/api/health/db')).status()).toBe(503);
});
