import type { Page } from '@playwright/test';
import type { DemoData } from '../../src/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { PREVIEW_SYSTEM_ADMIN, PREVIEW_SYSTEM_USERNAME } from '../../src/lib/preview-config';
import { test, expect, gotoPreview, loginPreview, finishWelcome, seedPopulatedPreview, readPreviewData, readPreviewSession, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION } from './helpers/preview';

const collections = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit'] as const;
function expectEmpty(data: DemoData) {
  for (const collection of collections) expect(data[collection], `${collection} must remain empty`).toEqual([]);
}

async function addAccount(page: Page, name: string, username: string, role: 'EMPLOYEE' | 'ADMIN', departmentId: string) {
  await gotoPreview(page, '/employees?add=1');
  const dialog = page.getByRole('dialog', { name: 'إضافة موظف جديد', exact: true });
  await dialog.getByLabel('الاسم الكامل', { exact: false }).fill(name);
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
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

test('legacy v1 fictional records and session are discarded in favor of an empty v2 installation', async ({ page }) => {
  await page.addInitScript(({ key, fixture }) => {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem('centerpro-ui-preview-v1', JSON.stringify({
        version: 1, data: fixture,
        session: { role: 'SUPER_ADMIN', employeeId: 'CP-0012', name: 'حسن أحمد فلاح' },
      }));
    }
  }, { key: PREVIEW_STORAGE_KEY, fixture: createPopulatedTestData() });
  await gotoPreview(page, '/login');
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v1'))).toBeNull();
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).version, PREVIEW_STORAGE_KEY)).toBe(PREVIEW_STORAGE_VERSION);
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toHaveValue(PREVIEW_SYSTEM_USERNAME);
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
});

test('the system Super Admin enters without becoming an employee and uncreated roles stay disabled', async ({ page }) => {
  await gotoPreview(page, '/login');
  await expect(page.getByRole('button', { name: 'المدير العام', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'مدير العمليات', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'موظف', exact: true })).toBeDisabled();
  await expect(page.getByLabel('حساب المعاينة', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  const session = await readPreviewSession(page);
  expect(session).toEqual(PREVIEW_SYSTEM_ADMIN);
  expect(session).not.toHaveProperty('employeeId');
  expectEmpty(await readPreviewData(page));
  await expect(page.locator('a[href="/employees/undefined"]')).toHaveCount(0);
  await gotoPreview(page, '/employees');
  await expect(page.getByText('أضف قسماً أولاً قبل إضافة الموظفين.', { exact: true })).toBeVisible();
  await gotoPreview(page, '/payroll');
  expect((await readPreviewData(page)).employees).toHaveLength(0);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(0);
});

test('role choices become available only after the owner manually creates the corresponding accounts', async ({ page }) => {
  test.setTimeout(90_000);
  await loginPreview(page);
  await gotoPreview(page, '/departments?add=1');
  const department = page.getByRole('dialog', { name: 'إضافة قسم جديد', exact: true });
  await department.getByLabel('اسم القسم', { exact: false }).fill('قسم الحسابات اليدوية');
  await department.getByLabel('نوع الراتب', { exact: true }).selectOption('FIXED');
  await department.getByLabel('الراتب القطعي', { exact: false }).fill('500000');
  await department.getByRole('button', { name: 'إضافة القسم', exact: true }).click();
  await expect(department).toBeHidden();
  const departmentId = (await readPreviewData(page)).departments[0].id;

  await addAccount(page, 'موظف يضاف يدوياً', 'MANUAL-EMP', 'EMPLOYEE', departmentId);
  await gotoPreview(page, '/login');
  await expect(page.getByRole('button', { name: 'موظف', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'مدير العمليات', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'موظف', exact: true }).click();
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toHaveValue('MANUAL-EMP');

  await loginPreview(page);
  await addAccount(page, 'مدير يضاف يدوياً', 'MANUAL-ADMIN', 'ADMIN', departmentId);
  await gotoPreview(page, '/login');
  await expect(page.getByRole('button', { name: 'مدير العمليات', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'موظف', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'مدير العمليات', exact: true }).click();
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toHaveValue('MANUAL-ADMIN');
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  const state = await readPreviewData(page);
  expect(state.employees).toHaveLength(2);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'ADMIN', employeeId: state.employees.find(employee => employee.username === 'MANUAL-ADMIN')!.id });
});

test('reset clears every operational collection and replaces an employee-based admin session with the independent system session', async ({ page }) => {
  const fixture = createPopulatedTestData();
  fixture.settings = { centerName: 'اسم معدل قبل إعادة الضبط', qrInterval: 60 };
  await seedPopulatedPreview(page, fixture);
  await gotoPreview(page, '/login');
  await page.getByLabel('حساب المعاينة', { exact: true }).selectOption('CP-0012');
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'SUPER_ADMIN', employeeId: 'CP-0012' });
  for (const collection of collections) expect((await readPreviewData(page))[collection].length).toBeGreaterThan(0);

  await gotoPreview(page, '/settings');
  await page.getByRole('button', { name: 'تصفير بيانات المعاينة', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إعادة ضبط جميع بيانات المعاينة؟', exact: true });
  await expect(dialog.getByRole('button', { name: 'تأكيد إعادة ضبط المعاينة', exact: true })).toBeDisabled();
  await dialog.getByLabel('اكتب «إعادة ضبط» للتأكيد', { exact: true }).fill('إعادة ضبط');
  await dialog.getByRole('button', { name: 'تأكيد إعادة ضبط المعاينة', exact: true }).click();
  await expect(dialog).toBeHidden();
  expectEmpty(await readPreviewData(page));
  expect((await readPreviewData(page)).settings).toEqual({ centerName: 'CenterPro', qrInterval: 45 });
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
  expect(await readPreviewSession(page)).not.toHaveProperty('employeeId');

  await gotoPreview(page, '/dashboard');
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
  await gotoPreview(page, '/login');
  await expect(page.getByRole('button', { name: 'مدير العمليات', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'موظف', exact: true })).toBeDisabled();
});
