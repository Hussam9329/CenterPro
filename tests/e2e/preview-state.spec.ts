import type { Page } from '@playwright/test';
import { createInitialData } from '../../src/lib/mock-data';
import type { DemoData } from '../../src/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY } from '../../src/lib/preview-config';
import { test, expect, gotoPreview, loginPreview, loginAccount, seedLocalAuth, fillLoginCredentials, submitLogin, finishWelcome, seedPopulatedPreview, SYSTEM_TEST_SESSION, AUTH_STORAGE_KEY, readPreviewData, readPreviewSession, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION } from './helpers/preview';

const collections = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const;
const populatedFixtureCollections = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit'] as const;
function expectEmpty(data: DemoData) {
  for (const collection of collections) expect(data[collection], `${collection} must remain empty`).toEqual([]);
}

async function addAccount(page: Page, name: string, username: string, role: 'EMPLOYEE' | 'ADMIN', departmentId: string) {
  await gotoPreview(page, '/employees?add=1');
  const dialog = page.getByRole('dialog', { name: 'إضافة موظف جديد', exact: true });
  await dialog.getByLabel('الاسم الكامل', { exact: false }).fill(name);
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('رقم الهاتف', { exact: true }).fill('712345678');
  await dialog.getByLabel('رقم هاتف ولي الأمر', { exact: true }).fill('912345678');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('القسم', { exact: false }).selectOption(departmentId);
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('اسم المستخدم', { exact: false }).fill(username);
  await dialog.getByLabel('الصلاحية', { exact: true }).selectOption(role);
  await dialog.getByLabel('كلمة المرور الأولية', { exact: false }).fill('Preview-not-a-real-password');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة الموظف', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('legacy v1 fictional records and session are discarded in favor of a clean installation', async ({ page }) => {
  await page.addInitScript(({ key, fixture }) => {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem('centerpro-ui-preview-v1', JSON.stringify({
        version: 1, data: fixture,
        session: { role: 'SUPER_ADMIN', employeeId: 'CP-0012', name: 'حسن أحمد فلاح' },
      }));
    }
  }, { key: PREVIEW_STORAGE_KEY, fixture: createPopulatedTestData() });
  await gotoPreview(page, '/login');
  // The server-rendered login is visible before the preview store hydrates.
  await expect(page.getByRole('button', { name: 'إنشاء حساب مدير النظام', exact: true })).toBeEnabled();
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v1'))).toBeNull();
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).version, PREVIEW_STORAGE_KEY)).toBe(PREVIEW_STORAGE_VERSION);
  await expect(page.getByLabel(/^اسم المستخدم/)).toHaveValue('centerpro-owner');
  await fillLoginCredentials(page);
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
});

test('system credential setup enters without creating an employee or exposing account choices', async ({ page }) => {
  await gotoPreview(page, '/login');
  await expect(page.getByRole('heading', { name: 'تهيئة مدير النظام', exact: true })).toBeVisible();
  await expect(page.locator('select')).toHaveCount(0);
  await fillLoginCredentials(page);
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  const session = await readPreviewSession(page);
  expect(session).toEqual(SYSTEM_TEST_SESSION);
  expect(session).not.toHaveProperty('employeeId');
  expectEmpty(await readPreviewData(page));
  await expect(page.locator('a[href="/employees/undefined"]')).toHaveCount(0);
  await gotoPreview(page, '/employees');
  await expect(page.getByText('أضف قسماً أولاً قبل إضافة الموظفين.', { exact: true })).toBeVisible();
  await gotoPreview(page, '/payroll');
  expect((await readPreviewData(page)).employees).toHaveLength(0);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(0);
});

test('manually created employee and admin credentials enter their assigned roles', async ({ page }) => {
  test.setTimeout(90_000);
  await loginPreview(page);
  await gotoPreview(page, '/departments?add=1');
  const department = page.getByRole('dialog', { name: 'إضافة قسم جديد', exact: true });
  await department.getByLabel('اسم القسم', { exact: false }).fill('قسم الحسابات اليدوية');
  await department.getByLabel('نوع الراتب', { exact: true }).selectOption('FIXED');
  await department.getByLabel('قيمة اليومية', { exact: false }).fill('25000');
  await department.getByLabel('خصم الغياب بدون عذر', { exact: false }).fill('50000');
  await department.getByLabel('الراتب القطعي', { exact: false }).fill('500000');
  await department.getByRole('button', { name: 'إضافة القسم', exact: true }).click();
  await expect(department).toBeHidden();
  const departmentId = (await readPreviewData(page)).departments[0].id;

  await addAccount(page, 'موظف يضاف يدوياً', 'MANUAL-EMP', 'EMPLOYEE', departmentId);
  await gotoPreview(page, '/login');
  const employeeAccount = (await readPreviewData(page)).employees.find(item => item.username === 'MANUAL-EMP')!;
  await loginAccount(page, employeeAccount.id);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'EMPLOYEE', employeeId: employeeAccount.id, authVersion: 1 });

  await loginPreview(page);
  await addAccount(page, 'مدير يضاف يدوياً', 'MANUAL-ADMIN', 'ADMIN', departmentId);
  await gotoPreview(page, '/login');
  const adminAccount = (await readPreviewData(page)).employees.find(item => item.username === 'MANUAL-ADMIN')!;
  await loginAccount(page, adminAccount.id);
  await expect(page).toHaveURL(/\/dashboard$/);
  const state = await readPreviewData(page);
  expect(state.employees).toHaveLength(2);
  const session = await readPreviewSession(page);
  expect(session).toMatchObject({ kind: 'EMPLOYEE', role: 'ADMIN', employeeId: state.employees.find(employee => employee.username === 'MANUAL-ADMIN')!.id });
  // Reinitialization must retain real v4 records created through the forms.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true })).toBeVisible();
  expect(await readPreviewData(page)).toEqual(state);
  expect(await readPreviewSession(page)).toEqual(session);
});

test('reset clears every operational collection and remembered copy without restoring old data in a new tab', async ({ page, context }) => {
  const fixture = createPopulatedTestData();
  fixture.settings = { centerName: 'اسم معدل قبل إعادة الضبط', qrInterval: 60 };
  await seedPopulatedPreview(page, fixture);
  await loginAccount(page, 'CP-0012', true);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'SUPER_ADMIN', employeeId: 'CP-0012' });
  for (const collection of populatedFixtureCollections) expect((await readPreviewData(page))[collection].length).toBeGreaterThan(0);

  await gotoPreview(page, '/settings');
  await page.getByRole('button', { name: 'تصفير بيانات النظام', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إعادة ضبط جميع بيانات النظام؟', exact: true });
  await expect(dialog.getByRole('button', { name: 'تأكيد إعادة ضبط النظام', exact: true })).toBeDisabled();
  await dialog.getByLabel('اكتب «إعادة ضبط» للتأكيد', { exact: true }).fill('إعادة ضبط');
  await dialog.getByRole('button', { name: 'تأكيد إعادة ضبط النظام', exact: true }).click();
  await expect(dialog).toBeHidden();
  expectEmpty(await readPreviewData(page));
  expect((await readPreviewData(page)).settings).toEqual({ centerName: 'CenterPro', qrInterval: 45 });
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
  expect(await readPreviewSession(page)).not.toHaveProperty('employeeId');
  expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  expectEmpty(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data, PREVIEW_DATA_STORAGE_KEY));
  const fresh = await context.newPage();
  await fresh.goto('/login');
  await expect(fresh.getByLabel(/^اسم المستخدم/)).toBeVisible();
  await expect(fresh.locator('select')).toHaveCount(0);
  expect(await fresh.evaluate(key => JSON.parse(localStorage.getItem(key)!).employees, AUTH_STORAGE_KEY)).toEqual({});
  expectEmpty(await readPreviewData(fresh));
  expect(await readPreviewSession(fresh)).toBeNull();

  await gotoPreview(page, '/dashboard');
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
  await gotoPreview(page, '/login');
  await expect(page.getByLabel(/^اسم المستخدم/)).toBeVisible();
  await expect(page.locator('select')).toHaveCount(0);
  await loginAccount(page);
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
  expectEmpty(await readPreviewData(page));
});


test('legacy v2/v3 operational stores are purged instead of restoring old test data', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await page.addInitScript(({ fixture }) => {
    sessionStorage.setItem('centerpro-ui-preview-v2', JSON.stringify({ version: 2, data: fixture, session: { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' } }));
    sessionStorage.setItem('centerpro-ui-preview-v3', JSON.stringify({ version: 3, data: fixture, session: { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' } }));
    localStorage.setItem('centerpro-ui-preview-data-v1', JSON.stringify({ version: 3, data: fixture }));
    localStorage.setItem('centerpro-ui-preview-remembered-v1', JSON.stringify({ version: 3, data: fixture, session: { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' } }));
  }, { fixture });
  await gotoPreview(page, '/login');
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toBeNull();
  await expect(page.getByLabel(/^اسم المستخدم/)).toBeVisible();
  await expect(page.locator('select')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v2'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v3'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('centerpro-ui-preview-data-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('centerpro-ui-preview-remembered-v1'))).toBeNull();
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).version, PREVIEW_STORAGE_KEY)).toBe(PREVIEW_STORAGE_VERSION);
});

test('a corrupt current payload does not erase a valid remembered owner dataset', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await seedLocalAuth(page, fixture);
  const corrupt = '{incomplete owner storage';
  await page.addInitScript(({ key, persistentKey, version, fixture, session, corrupt }) => {
    sessionStorage.setItem(key, corrupt);
    localStorage.setItem(persistentKey, JSON.stringify({ version, data: fixture, session }));
  }, { key: PREVIEW_STORAGE_KEY, persistentKey: PREVIEW_PERSISTENT_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, fixture, session: SYSTEM_TEST_SESSION, corrupt });
  await gotoPreview(page, '/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewData(page)).toEqual(fixture);
  expect(await readPreviewSession(page)).toEqual(SYSTEM_TEST_SESSION);
  expect(await page.evaluate(key => sessionStorage.getItem(`${key}-recovery`), PREVIEW_STORAGE_KEY)).toBe(corrupt);
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
});

test('malformed remembered storage does not replace valid owner data in the current tab', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await seedPopulatedPreview(page, fixture);
  await page.addInitScript(key => localStorage.setItem(key, '{invalid remembered data'), PREVIEW_PERSISTENT_STORAGE_KEY);
  await gotoPreview(page, '/login');
  await expect(page.getByLabel(/^اسم المستخدم/)).toBeVisible();
  expect(await readPreviewData(page)).toEqual(fixture);
  expect(await readPreviewSession(page)).toBeNull();
  await fillLoginCredentials(page);
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewData(page)).toEqual(fixture);
});

test('blocked session storage still restores remembered owner data from local storage', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await seedLocalAuth(page, fixture);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ persistentKey, version, fixture, session }) => {
    localStorage.setItem(persistentKey, JSON.stringify({ version, data: fixture, session }));
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
  }, { persistentKey: PREVIEW_PERSISTENT_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, fixture, session: SYSTEM_TEST_SESSION });
  await gotoPreview(page, '/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true }).getByRole('link', { name: 'الموظفون', exact: true }).click();
  await expect(page.locator('.desktop-table tbody')).toContainText('علي محمد حسن');
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const scenario of ['department-only', 'inactive-accounts']) {
  test(`test-data loader cannot replace an existing ${scenario} installation`, async ({ page }) => {
    const populated = createPopulatedTestData();
    const fixture = scenario === 'department-only'
      ? { ...createInitialData(), departments: [populated.departments[0]] }
      : { ...populated, employees: populated.employees.map(employee => ({ ...employee, active: false })) };
    await seedPopulatedPreview(page, fixture);
    await gotoPreview(page, '/login');
    await expect(page.getByRole('button', { name: 'تحميل بيانات الاختبار', exact: true })).toHaveCount(0);
    expect(await readPreviewData(page)).toEqual(fixture);
  });
}
