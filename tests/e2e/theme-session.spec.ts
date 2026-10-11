import { test, expect, loginAccount, fillLoginCredentials, submitLogin, seedLocalAuth, finishWelcome, gotoPreview, readPreviewData, readPreviewSession, seedPopulatedPreview, PREVIEW_STORAGE_KEY, PREVIEW_TEST_TIME } from './helpers/preview';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY } from '../../src/lib/preview-config';

test('theme toggle is explicit, persists locally, and supports light/dark without following the OS automatically', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoPreview(page, '/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const toggle = page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'تفعيل الوضع الفاتح', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('remembered sessions share owner data across tabs and logout clears sign-in without deleting the data', async ({ page, context }) => {
  await seedPopulatedPreview(page);
  await loginAccount(page, 'SYSTEM', true);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.evaluate(key => Boolean(localStorage.getItem(key)), PREVIEW_PERSISTENT_STORAGE_KEY)).toBe(true);
  await gotoPreview(page, '/settings');
  await page.getByLabel('اسم المركز', { exact: true }).fill('بيانات المالك المحفوظة');
  await page.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
  const saved = await readPreviewData(page);

  const reopened = await context.newPage();
  await reopened.goto('/login');
  await expect(reopened).toHaveURL(/\/dashboard$/);
  await expect(reopened.getByTestId('centerpro-welcome')).toHaveCount(0);
  expect(await readPreviewData(reopened)).toEqual(saved);

  await page.getByLabel('اسم المركز', { exact: true }).fill('تعديل يظهر في كل التبويبات');
  await page.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
  await expect.poll(async () => (await readPreviewData(reopened)).settings.centerName).toBe('تعديل يظهر في كل التبويبات');
  const latest = await readPreviewData(page);
  const staleRememberedTab = await page.evaluate(key => sessionStorage.getItem(key)!, PREVIEW_STORAGE_KEY);

  await reopened.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(reopened).toHaveURL(/\/login$/);
  await expect(page).toHaveURL(/\/login$/);
  expect(await readPreviewSession(page)).toBeNull();
  expect(await reopened.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  expect(await reopened.evaluate(key => JSON.parse(localStorage.getItem(key)!).data, PREVIEW_DATA_STORAGE_KEY)).toEqual(latest);
  // Simulate a suspended tab that did not receive the logout storage event.
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: PREVIEW_STORAGE_KEY, raw: staleRememberedTab });
  await page.reload();
  await expect(page.getByLabel(/^اسم المستخدم/)).toBeVisible();
  expect(await readPreviewSession(page)).toBeNull();
  expect(await readPreviewData(page)).toEqual(latest);
  await reopened.close();
  await page.close();

  const nextVisit = await context.newPage();
  await nextVisit.clock.install({ time: PREVIEW_TEST_TIME });
  await nextVisit.goto('/login');
  await expect(nextVisit.getByLabel(/^اسم المستخدم/)).toBeVisible();
  await expect(nextVisit.getByTestId('centerpro-welcome')).toHaveCount(0);
  expect(await readPreviewSession(nextVisit)).toBeNull();
  expect(await readPreviewData(nextVisit)).toEqual(latest);
  await fillLoginCredentials(nextVisit);
  await submitLogin(nextVisit);
  await finishWelcome(nextVisit);
  await expect(nextVisit).toHaveURL(/\/dashboard$/);
  expect(await readPreviewData(nextVisit)).toEqual(latest);
  expect(await nextVisit.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
});

test('a session without remember remains in its tab and does not sign in a new tab', async ({ page, context }) => {
  await seedPopulatedPreview(page);
  await loginAccount(page);
  const fresh = await context.newPage();
  await fresh.goto('/login');
  await expect(fresh.getByLabel(/^اسم المستخدم/)).toBeVisible();
  expect(await readPreviewSession(fresh)).toBeNull();
  expect((await readPreviewData(fresh)).employees).toHaveLength(0);
  expect(await fresh.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('switching accounts after remembered logout requires explicit login and keeps remember disabled', async ({ page }) => {
  await seedPopulatedPreview(page);
  await loginAccount(page, 'SYSTEM', true);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByLabel(/^اسم المستخدم/)).toBeVisible();
  expect(await readPreviewSession(page)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await expect(page.getByLabel('ابقني مسجلاً', { exact: true })).not.toBeChecked();
  await loginAccount(page, 'CP-0001');
  await expect(page).toHaveURL(/\/employee$/);
  expect(await readPreviewSession(page)).toMatchObject({ employeeId: 'CP-0001' });
  expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
});

for (const denied of [['localStorage'], ['sessionStorage', 'localStorage']] as const) {
  test(`blocked ${denied.join(' and ')} rejects credential setup while the theme remains usable`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(kinds => {
      for (const kind of kinds) Object.defineProperty(window, kind, { configurable: true, get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
    }, denied);
    await gotoPreview(page, '/login');
    await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await fillLoginCredentials(page);
    await page.getByLabel('ابقني مسجلاً', { exact: true }).check();
    await submitLogin(page);
    await expect(page.locator('form').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'إنشاء حساب مدير النظام', exact: true })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
    await gotoPreview(page, '/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  });
}

test('blocked session storage still permits password verification and remembered login through local storage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seedLocalAuth(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
  });
  await gotoPreview(page, '/login');
  await fillLoginCredentials(page);
  await page.getByLabel('ابقني مسجلاً', { exact: true }).check();
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
