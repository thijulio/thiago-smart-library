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
test('reading preserves platforms, slots, ties and opens private details', async ({
  page,
}, testInfo) => {
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
  const screenshot = testInfo.outputPath('reading.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('reading', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(
    darkResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  const darkScreenshot = testInfo.outputPath('reading-dark.png');
  await page.screenshot({ path: darkScreenshot, fullPage: true });
  await testInfo.attach('reading-dark', { path: darkScreenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('link', { name: 'Reading', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeFocused();
    const focusedScreenshot = testInfo.outputPath('reading-keyboard.png');
    await page.screenshot({ path: focusedScreenshot, fullPage: true });
    await testInfo.attach('reading-keyboard', {
      path: focusedScreenshot,
      contentType: 'image/png',
    });
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('link', { name: /Current Kindle/ }).tap();
  }
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
  await expect(page.getByRole('main').getByRole('status')).toContainText('Opening your reading');
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

// Trigger the same Nuxt refresh hook as refreshNuxtData without reloading or
// remounting the page. Keep this test driver out of the production application.
async function refreshReading(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector('#__nuxt') as Element & {
      __vue_app__: {
        $nuxt: { callHook: (name: string, keys: string[]) => Promise<void> };
      };
    };
    void root.__vue_app__.$nuxt.callHook('app:data:refresh', ['private-reading']);
  });
}
for (const failure of ['unavailable', 'malformed', 'unauthorized', 'forbidden'] as const) {
  test(`same-session ${failure} refresh hides previously loaded private content`, async ({
    page,
  }) => {
    await session(page);
    let refreshFailed = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/private/reading', async (route) => {
      if (!refreshFailed) {
        await route.fulfill({ json: { queueState: 'available', books: rows } });
        return;
      }
      await gate;
      await route.fulfill(
        failure === 'malformed'
          ? { json: { books: rows } }
          : {
              status: failure === 'unavailable' ? 503 : failure === 'unauthorized' ? 401 : 403,
              json: { error: 'Unavailable' },
            },
      );
    });
    await page.goto('/library/reading');
    await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
    await expect(page.getByText('Continue this series')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dataset.refreshDocument = 'original';
    });
    refreshFailed = true;
    await refreshReading(page);
    await expect(page.getByRole('main').getByRole('status')).toContainText('Opening your reading');
    await expect(page.getByRole('link', { name: /Current Kindle/ })).toHaveCount(0);
    await expect(page.getByText('Continue this series')).toHaveCount(0);
    release();
    if (failure === 'unauthorized' || failure === 'forbidden') {
      await expect(page).toHaveURL(/signin=required/);
    } else {
      await expect(page.getByRole('alert')).toContainText(
        failure === 'malformed' ? 'Reading data unavailable' : 'Your reading couldn’t load',
      );
    }
    for (const book of rows)
      await expect(page.getByText(book.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Continue this series')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-refresh-document', 'original');
    if (failure === 'unavailable' || failure === 'malformed') {
      refreshFailed = false;
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('link', { name: /Current Kindle/ })).toBeVisible();
    }
  });
}
