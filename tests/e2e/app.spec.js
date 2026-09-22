const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe.configure({ mode: 'serial' });

const pages = ['/', '/sessions', '/library', '/statistics', '/settings'];

test.describe('FretLog navigation', () => {
  for (const path of pages) {
    test(`${path} loads successfully`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(/FretLog/);
      await expect(page.locator('body')).toContainText('FretLog');
    });
  }
});

test('theme toggle updates and restores the selected theme', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');
  const originalTheme = await root.getAttribute('data-theme');

  await page.locator('#theme-toggle').click();
  await expect(root).not.toHaveAttribute('data-theme', originalTheme);

  await page.locator('#theme-toggle').click();
  await expect(root).toHaveAttribute('data-theme', originalTheme);
});

test('instrument modal supports keyboard close and focus restoration', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('#change-instrument-btn');
  await trigger.click();

  const modal = page.locator('#change-instrument-modal');
  await expect(modal).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/active/);
  await expect(trigger).toBeFocused();
});

test('mobile navigation is visible on a mobile viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile viewport only');
  await page.goto('/');
  await expect(page.locator('.mobile-nav')).toBeVisible();
});

test('PWA manifest and Service Worker are available', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.request.get('/manifest.json');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe('standalone');

  await expect.poll(async () => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).some(registration =>
      registration.active && registration.active.state === 'activated'
    )
  )).toBeTruthy();
});

test('practice session can be started and cancelled', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Single-user session state is tested once on desktop');
  const currentResponse = await page.request.get('/api/sessions/current');
  const current = await currentResponse.json();
  if (current?.id) await page.request.delete(`/api/sessions/${current.id}`);
  await page.request.delete('/api/sessions/current');
  await page.goto('/');
  await page.locator('#start-session-btn').click();
  await expect(page.locator('#current-session-panel')).toBeVisible();

  await page.reload();
  await expect(page.locator('#current-session-panel')).toBeVisible();

  await page.locator('#end-session-btn').click();
  await expect(page.locator('#cancel-session-modal')).toHaveClass(/active/);
  await page.locator('#confirm-cancel-session').click();
  await expect(page.locator('#current-session-panel')).toBeHidden();
});

test.describe('Accessibility checks', () => {
  test.use({ serviceWorkers: 'block' });
  for (const path of pages) {
    test(`${path} has no critical automated accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      });
      await page.reload();
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter(violation => violation.impact === 'critical');
      expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    });
  }
});

test('practice item timer records elapsed time', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Single-user session state is tested once on desktop');
  const currentResponse = await page.request.get('/api/sessions/current');
  const current = await currentResponse.json();
  if (current?.id) await page.request.delete(`/api/sessions/${current.id}`);
  await page.request.delete('/api/sessions/current');
  const libraryResponse = await page.request.post('/api/library', {
    data: { name: 'E2E Timer Item', categoryId: 'cat-ear-training', starRating: 0 }
  });
  expect(libraryResponse.ok()).toBeTruthy();
  await page.goto('/');
  await page.locator('#start-session-btn').click();
  await page.locator('#add-item-btn').click();
  await page.locator('#add-item-select').selectOption({ index: 1 });
  await page.locator('#confirm-add-item').click();

  const item = page.locator('#session-items-list .practice-list-item').first();
  await item.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(1200);
  await item.getByRole('button', { name: 'Pause' }).click();
  await expect(item.locator('.practice-item-time')).not.toHaveText('0s');

  await item.locator('button').last().click();

  await page.locator('#end-session-btn').click();
  await page.locator('#cancel-session-modal').getByRole('button', { name: 'Cancel Session', exact: true }).click();
});
