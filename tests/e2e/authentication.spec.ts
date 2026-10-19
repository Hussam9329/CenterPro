import { pbkdf2Sync } from 'node:crypto';
import type { AuthStore } from '../../src/lib/local-auth';
import { PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_SYSTEM_ADMIN } from '../../src/lib/preview-config';
import { createPopulatedTestData } from '../fixtures/populated-data';
import {
  test, expect, gotoPreview, loginAccount, seedPopulatedPreview, fillLoginCredentials,
  submitLogin, finishWelcome, readPreviewData, readPreviewSession, createTestAuthStore,
  AUTH_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, SYSTEM_TEST_SESSION,
  TEST_PASSWORD,
} from './helpers/preview';

const loginError = 'اسم المستخدم أو كلمة المرور غير صحيحة.';

test('first owner setup validates confirmation and persists a salted hash for a custom username', async ({ page }) => {
  await gotoPreview(page, '/login');
  await expect(page.getByRole('heading', { name: 'تهيئة مدير النظام', exact: true })).toBeVisible();
  await fillLoginCredentials(page, '  Center.Owner  ', 'short');
  await submitLogin(page);
  await expect(page.locator('form').getByRole('alert')).toHaveText('كلمة المرور يجب أن تتكون من 8 أحرف على الأقل، وتجمع بين حروف وأرقام أو رموز.');
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
  expect(await readPreviewSession(page)).toBeNull();

  await fillLoginCredentials(page, '  Center.Owner  ');
  await page.getByLabel(/^تأكيد كلمة المرور/).fill('Different-confirmation');
  await submitLogin(page);
  await expect(page.locator('form').getByRole('alert')).toHaveText('تأكيد كلمة المرور غير مطابق.');
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();

  await page.getByLabel(/^تأكيد كلمة المرور/).fill(TEST_PASSWORD);
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
  expect((await readPreviewData(page)).employees).toEqual([]);
  const auth: AuthStore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), AUTH_STORAGE_KEY);
  expect(auth.system).toMatchObject({ username: 'Center.Owner', version: 1 });
  expect(auth.employees).toEqual({});
  const credential = auth.system!;
  expect(Buffer.from(credential.salt, 'base64')).toHaveLength(16);
  expect(Buffer.from(credential.hash, 'base64')).toHaveLength(32);
  expect(pbkdf2Sync(TEST_PASSWORD, Buffer.from(credential.salt, 'base64'), 150_000, 32, 'sha256').toString('base64')).toBe(credential.hash);
  const storedValues = await page.evaluate(() => [localStorage, sessionStorage].flatMap(storage => Object.values(storage)));
  expect(storedValues.join('\n')).not.toContain(TEST_PASSWORD);
  expect(storedValues.join('\n')).not.toContain('Different-confirmation');

  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.getByLabel(/^تأكيد كلمة المرور/)).toHaveCount(0);
  await fillLoginCredentials(page, '  CENTER.OWNER  ');
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).system, AUTH_STORAGE_KEY)).toEqual(credential);
  await page.reload();
  await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
});

test('wrong passwords and unknown usernames reject login with the same error and no session', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await seedPopulatedPreview(page, fixture);
  await gotoPreview(page, '/login');
  const employee = fixture.employees.find(account => account.id === 'CP-0001')!;
  for (const [username, password] of [[employee.username, 'Incorrect-password'], ['unknown-account', TEST_PASSWORD]]) {
    await fillLoginCredentials(page, username, password);
    await submitLogin(page);
    await expect(page.locator('form').getByRole('alert')).toHaveText(loginError);
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
    expect(await readPreviewSession(page)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  }
  expect(await readPreviewData(page)).toEqual(fixture);
  await loginAccount(page, employee.id);
  expect(await readPreviewSession(page)).toMatchObject({ employeeId: employee.id, role: 'EMPLOYEE', authVersion: 1 });
});

for (const remembered of [false, true]) {
  test(`credential version changes in another tab revoke ${remembered ? 'remembered' : 'tab-only'} sessions`, async ({ page, context }) => {
    await seedPopulatedPreview(page);
    await loginAccount(page, 'CP-0001', remembered);
    const before = await readPreviewData(page);
    const other = await context.newPage();
    await other.goto('/login?switch=1');
    await expect(other.locator('form button[type="submit"]')).toBeEnabled();
    // A password change writes a higher credential version; its storage event
    // must invalidate open tabs before their protected views can be used again.
    await other.evaluate(key => {
      const auth = JSON.parse(localStorage.getItem(key)!);
      auth.employees['CP-0001'].version += 1;
      localStorage.setItem(key, JSON.stringify(auth));
    }, AUTH_STORAGE_KEY);
    await expect(page).toHaveURL(/\/login$/);
    expect(await readPreviewSession(page)).toBeNull();
    expect(await readPreviewData(page)).toEqual(before);
    expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
    await gotoPreview(page, '/employee');
    await expect(page).toHaveURL(/\/login$/);
    expect(await readPreviewSession(page)).toBeNull();
    await loginAccount(page, 'CP-0001');
    expect(await readPreviewSession(page)).toMatchObject({ employeeId: 'CP-0001', authVersion: 2 });
  });
}

test('removing local credentials in another tab revokes an owner session without deleting operational records', async ({ page, context }) => {
  await seedPopulatedPreview(page);
  await loginAccount(page);
  const before = await readPreviewData(page);
  const other = await context.newPage();
  await other.goto('/login');
  await expect(other.locator('form button[type="submit"]')).toBeEnabled();
  await other.evaluate(key => localStorage.removeItem(key), AUTH_STORAGE_KEY);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'تهيئة مدير النظام', exact: true })).toBeVisible();
  expect(await readPreviewSession(page)).toBeNull();
  expect(await readPreviewData(page)).toEqual(before);
});

for (const account of ['SYSTEM', 'CP-0001']) {
  test(`legacy ${account} session without a credential version requires password login`, async ({ page }) => {
    const fixture = createPopulatedTestData();
    const employee = fixture.employees.find(record => record.id === account);
    const legacySession = employee
      ? { kind: 'EMPLOYEE', role: employee.role, employeeId: employee.id, name: employee.name }
      : PREVIEW_SYSTEM_ADMIN;
    await page.addInitScript(({ dataKey, version, authKey, auth, fixture, legacySession }) => {
      sessionStorage.setItem(dataKey, JSON.stringify({ version, data: fixture, session: legacySession }));
      localStorage.setItem(authKey, JSON.stringify(auth));
    }, { dataKey: PREVIEW_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, authKey: AUTH_STORAGE_KEY, auth: createTestAuthStore(fixture), fixture, legacySession });
    await gotoPreview(page, account === 'SYSTEM' ? '/dashboard' : '/employee');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    expect(await readPreviewSession(page)).toBeNull();
    expect(await readPreviewData(page)).toEqual(fixture);
    await loginAccount(page, account);
    expect(await readPreviewSession(page)).toMatchObject({ authVersion: 1 });
  });
}

test('corrupt stored credentials cannot be overwritten by a new owner setup', async ({ page }) => {
  const fixture = createPopulatedTestData();
  const corruptAuth = '{"schema":1,"system":{"username":"original-owner","hash":"invalid"},"employees":{}}';
  await seedPopulatedPreview(page, fixture);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: AUTH_STORAGE_KEY, raw: corruptAuth });
  await gotoPreview(page, '/login');
  await fillLoginCredentials(page, 'replacement-owner');
  await submitLogin(page);
  await expect(page.locator('form').getByRole('alert')).toHaveText('تعذر تسجيل الدخول. حاول مرة أخرى.');
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBe(corruptAuth);
  expect(await readPreviewSession(page)).toBeNull();
  expect(await readPreviewData(page)).toEqual(fixture);
});

test('first owner setup cannot reuse an existing employee username', async ({ page }) => {
  const fixture = createPopulatedTestData();
  const auth = createTestAuthStore(fixture);
  auth.system = null;
  await seedPopulatedPreview(page, fixture);
  await page.addInitScript(({ key, auth }) => localStorage.setItem(key, JSON.stringify(auth)), { key: AUTH_STORAGE_KEY, auth });
  await gotoPreview(page, '/login');
  await fillLoginCredentials(page, `  ${fixture.employees[0].username.toUpperCase()}  `);
  await submitLogin(page);
  await expect(page.locator('form').getByRole('alert')).toHaveText('تعذر إنشاء حساب مدير النظام. جرّب اسم مستخدم آخر.');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), AUTH_STORAGE_KEY)).toEqual(auth);
  expect(await readPreviewSession(page)).toBeNull();
  expect(await readPreviewData(page)).toEqual(fixture);
});
