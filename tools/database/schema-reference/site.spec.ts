import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('full reference works at project prefix without application data', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('This is the repository schema at commit', { exact: false }),
  ).toBeVisible();
  const model = JSON.parse(await readFile('dist/schema-reference/schema.json', 'utf8'));
  await expect(page.locator('[data-object-id]')).toHaveCount(model.objects.length);
  await expect(page.locator('svg [data-relationship-id]')).toHaveCount(model.relationships.length);
  await page.getByLabel('Search schema objects and definitions').fill('auth.session');
  await expect(page.getByRole('heading', { name: 'auth.session', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'library.books', exact: true })).toBeHidden();
  await page.getByLabel('Search schema objects and definitions').fill('');
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'library.books table', exact: true })
    .click();
  await expect(page).toHaveURL(/#object-/);
  const sql = await request.get('./schema.sql');
  expect(sql.ok()).toBe(true);
  expect(await sql.text()).toContain('CREATE TABLE auth.');
  expect(await sql.text()).not.toContain('private_fixture_marker');
  for (const path of [
    'assets/biome.css',
    'assets/reference.css',
    'assets/reference.js',
    'schema.json',
  ])
    expect((await request.get('./' + path)).ok()).toBe(true);
  expect(errors).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: 'test-results/schema-reference/' + test.info().project.name + '.png',
    fullPage: false,
  });
});
test('search is keyboard accessible and downloads use relative paths', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const search = page.getByLabel('Search schema objects and definitions');
  await search.focus();
  await page.keyboard.type('does-not-exist');
  await expect(page.getByRole('status')).toHaveText('0 objects shown');
  await search.clear();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveAttribute('data-nav-id', /./);
  await expect(page.getByRole('link', { name: 'Download schema-only SQL' })).toHaveAttribute(
    'href',
    './schema.sql',
  );
});
