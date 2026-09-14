import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('renders the welcome page and persists the selected theme', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Thiago Smart Library' })).toBeVisible();
  await expect(page.getByText('Hello, world.')).toBeVisible();
  await expect(page.getByText('Service: available')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Visit the current prototype' })).toHaveAttribute(
    'href',
    'https://thiago-library.netlify.app',
  );
  const lightScreenshot = testInfo.outputPath('welcome-light.png');
  await page.screenshot({ path: lightScreenshot, fullPage: true });
  await testInfo.attach('welcome-light', { path: lightScreenshot, contentType: 'image/png' });
  const themeToggle = page.getByRole('button', { name: 'Switch to dark mode' });
  await themeToggle.focus();
  await themeToggle.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  const darkScreenshot = testInfo.outputPath('welcome-dark.png');
  await page.screenshot({ path: darkScreenshot, fullPage: true });
  await testInfo.attach('welcome-dark', { path: darkScreenshot, contentType: 'image/png' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});
test('has no horizontal overflow on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
  ).toEqual([]);
});

test('serves the health contract through the local HTTP boundary', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });

  const rejected = await request.post('/api/health');
  expect(rejected.status()).toBe(405);
  expect(rejected.headers().allow).toBe('GET');

  const missing = await request.get('/api/missing');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain('Thiago Smart Library');
});
