import { expect, test, gotoPreview, loginPreview } from './helpers/preview';

test('PWA installs an RTL manifest and provides a public-only offline fallback', async ({ page, context }) => {
  await gotoPreview(page, '/login');
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestUrl).toBeTruthy();
  const manifestResponse = await page.request.get(manifestUrl!);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ short_name: 'CenterPro', lang: 'ar', dir: 'rtl', display: 'standalone', scope: '/', start_url: '/login', theme_color: '#A51C30' });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]));
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await page.request.get(icon.src);
    expect(response.ok(), `Manifest icon ${icon.src} must load`).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || '')).toContain('/sw.js');
  await loginPreview(page);
  await gotoPreview(page, '/payroll');
  await expect(page.getByRole('heading', { name: 'الرواتب', exact: true })).toBeVisible();

  const cacheEntries = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async name => {
      const cache = await caches.open(name);
      return (await cache.keys()).map(request => ({ cache: name, url: request.url, method: request.method }));
    }))).flat();
  });
  expect(cacheEntries.length).toBeGreaterThan(0);
  const paths = cacheEntries.map(entry => new URL(entry.url).pathname);
  expect(paths).toContain('/offline.html');
  expect(paths).toContain('/icons/icon-192.png');
  for (const entry of cacheEntries) {
    const url = new URL(entry.url);
    expect(entry.method).toBe('GET');
    expect(url.pathname, 'No employee, attendance, API or payroll response may be stored in Cache Storage').toMatch(/^\/(?:offline\.html|icons\/[^/]+\.(?:png|svg|ico))$/);
    expect(url.search).toBe('');
  }

  await context.setOffline(true);
  const offlineResponse = await page.goto('/payroll?offline-check=1');
  expect(offlineResponse?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { name: 'أنت غير متصل بالإنترنت', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إعادة المحاولة', exact: true })).toBeVisible();
  await expect(page.getByText('يحتاج تسجيل الحضور وتحديث البيانات إلى اتصال مباشر.', { exact: false })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.data-table')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'الرواتب', exact: true })).toHaveCount(0);
  await expect.poll(() => page.getByRole('img', { name: 'CenterPro', exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
