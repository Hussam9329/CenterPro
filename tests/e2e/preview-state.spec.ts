import type { Page } from '@playwright/test';
import { createInitialData } from '../../src/lib/mock-data';
import type { DemoData } from '../../src/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_SYSTEM_ADMIN } from '../../src/lib/preview-config';
import { test, expect, gotoPreview, loginPreview, finishWelcome, seedPopulatedPreview, readPreviewData, readPreviewSession, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION } from './helpers/preview';

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

test('legacy v1 fictional records and session are discarded in favor of an empty v3 installation', async ({ page }) => {
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
  await expect(page.getByLabel('الحساب', { exact: true })).toHaveValue('SYSTEM');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
});

test('the system Super Admin enters without becoming an employee and uncreated roles stay disabled', async ({ page }) => {
  await gotoPreview(page, '/login');
  const accountSelect = page.getByLabel('الحساب', { exact: true });
  await expect(accountSelect).toHaveValue('SYSTEM');
  await expect(accountSelect.locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
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
  await department.getByLabel('قيمة اليومية', { exact: false }).fill('25000');
  await department.getByLabel('خصم الغياب بدون عذر', { exact: false }).fill('50000');
  await department.getByLabel('الراتب القطعي', { exact: false }).fill('500000');
  await department.getByRole('button', { name: 'إضافة القسم', exact: true }).click();
  await expect(department).toBeHidden();
  const departmentId = (await readPreviewData(page)).departments[0].id;

  await addAccount(page, 'موظف يضاف يدوياً', 'MANUAL-EMP', 'EMPLOYEE', departmentId);
  await gotoPreview(page, '/login');
  const employeeAccount = (await readPreviewData(page)).employees.find(item => item.username === 'MANUAL-EMP')!;
  await expect(page.getByLabel('الحساب', { exact: true }).locator(`option[value="${employeeAccount.id}"]`)).toHaveCount(1);

  await loginPreview(page);
  await addAccount(page, 'مدير يضاف يدوياً', 'MANUAL-ADMIN', 'ADMIN', departmentId);
  await gotoPreview(page, '/login');
  const adminAccount = (await readPreviewData(page)).employees.find(item => item.username === 'MANUAL-ADMIN')!;
  await page.getByLabel('الحساب', { exact: true }).selectOption(adminAccount.id);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  const state = await readPreviewData(page);
  expect(state.employees).toHaveLength(2);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'ADMIN', employeeId: state.employees.find(employee => employee.username === 'MANUAL-ADMIN')!.id });
});

test('reset clears every operational collection and remembered copy without restoring old data in a new tab', async ({ page, context }) => {
  const fixture = createPopulatedTestData();
  fixture.settings = { centerName: 'اسم معدل قبل إعادة الضبط', qrInterval: 60 };
  await seedPopulatedPreview(page, fixture);
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption('CP-0012');
  await page.getByLabel('ابقني مسجلاً', { exact: true }).check();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewSession(page)).toMatchObject({ kind: 'EMPLOYEE', role: 'SUPER_ADMIN', employeeId: 'CP-0012' });
  for (const collection of populatedFixtureCollections) expect((await readPreviewData(page))[collection].length).toBeGreaterThan(0);

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
  expect(await page.evaluate(key => localStorage.getItem(key), PREVIEW_PERSISTENT_STORAGE_KEY)).toBeNull();
  expectEmpty(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data, PREVIEW_DATA_STORAGE_KEY));
  const fresh = await context.newPage();
  await fresh.goto('/login');
  await expect(fresh.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(1);
  expectEmpty(await readPreviewData(fresh));
  expect(await readPreviewSession(fresh)).toBeNull();

  await gotoPreview(page, '/dashboard');
  expectEmpty(await readPreviewData(page));
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
  await gotoPreview(page, '/login');
  await expect(page.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(1);
});


test('v2 owner data and archived payroll migrate intact to v3 with empty evaluation collections', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await page.addInitScript(({ key, fixture }) => {
    if (sessionStorage.getItem(key)) return;
    const legacy: Partial<typeof fixture> = { ...fixture };
    delete legacy.evaluationCycles;
    delete legacy.evaluationExams;
    delete legacy.examEvaluations;
    sessionStorage.setItem('centerpro-ui-preview-v2', JSON.stringify({ version: 2, data: legacy, session: { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' } }));
  }, { key: PREVIEW_STORAGE_KEY, fixture });
  await gotoPreview(page, '/payroll');
  await expect(page.getByRole('heading', { name: 'الرواتب', exact: true })).toBeVisible();
  expect(await readPreviewData(page)).toEqual(fixture);
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).version, PREVIEW_STORAGE_KEY)).toBe(3);
  expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v2'))).not.toBeNull();
  await gotoPreview(page, '/login');
  await expect(page.getByRole('button', { name: 'تحميل بيانات الاختبار', exact: true })).toHaveCount(0);
  expect(await readPreviewData(page)).toEqual(fixture);
});

for (const version of [2, 3]) {
  test(`v${version} legacy evaluation cycles and frozen snapshots survive season schema migration`, async ({ page }) => {
    const fixture = createPopulatedTestData();
    const historicalRow = { employeeId: 'CP-0001', employeeName: 'اسم تاريخي محفوظ', employeeCode: 'CP-0001', papers: 37, correctionErrors: 2, behaviorErrors: 1, examsEvaluated: 1, score: 24, accuracy: 91.89 };
    fixture.evaluationCycles = [
      { id: 'legacy-closed', name: 'دورة قديمة مؤرشفة', state: 'ARCHIVED', openedAt: '2026-08-01T08:00:00.000Z', openedBy: 'مدير النظام', closedAt: '2026-08-31T16:00:00.000Z', closedBy: 'مدير النظام', snapshot: { rows: [historicalRow], exams: [{ id: 'legacy-exam-closed', name: 'امتحان تاريخي', date: '2026-08-15', rows: [historicalRow] }] } },
      { id: 'legacy-open', name: 'دورة قديمة مفتوحة', state: 'OPEN', openedAt: '2026-09-01T08:00:00.000Z', openedBy: 'مدير النظام' },
    ];
    fixture.evaluationExams = [
      { id: 'legacy-exam-closed', cycleId: 'legacy-closed', name: 'امتحان تاريخي', date: '2026-08-15', state: 'CLOSED', note: 'تبقى الملاحظات الأصلية', createdBy: 'مدير النظام', createdAt: '2026-08-15T08:00:00.000Z', closedAt: '2026-08-15T16:00:00.000Z', closedBy: 'مدير النظام' },
      { id: 'legacy-exam-open', cycleId: 'legacy-open', name: 'امتحان قائم', date: '2026-09-28', state: 'OPEN', note: '', createdBy: 'مدير النظام', createdAt: '2026-09-28T08:00:00.000Z' },
    ];
    fixture.examEvaluations = [{ id: 'legacy-evaluation', examId: 'legacy-exam-closed', employeeId: 'CP-0001', papers: 37, correctionErrors: 2, behaviorErrors: 1, note: 'تقييم محفوظ', createdBy: 'CP-0004', createdAt: '2026-08-15T09:00:00.000Z', updatedBy: 'CP-0004', updatedAt: '2026-08-15T09:00:00.000Z' }];
    await page.addInitScript(({ currentKey, version, fixture, session }) => {
      if (sessionStorage.getItem(currentKey)) return;
      const legacy: Partial<typeof fixture> = { ...fixture };
      delete legacy.evaluationSeasons;
      const key = version === 2 ? 'centerpro-ui-preview-v2' : currentKey;
      sessionStorage.setItem(key, JSON.stringify({ version, data: legacy, session }));
    }, { currentKey: PREVIEW_STORAGE_KEY, version, fixture, session: PREVIEW_SYSTEM_ADMIN });
    await gotoPreview(page, '/dashboard');
    await expect(page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true })).toBeVisible();
    expect(await readPreviewData(page)).toEqual(fixture);
    await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
    await page.reload();
    expect(await readPreviewData(page)).toEqual(fixture);
    expect((await readPreviewData(page)).evaluationCycles.every(cycle => cycle.seasonId === undefined)).toBe(true);
  });
}

test('a corrupt current payload does not erase a valid remembered owner dataset', async ({ page }) => {
  const fixture = createPopulatedTestData();
  const corrupt = '{incomplete owner storage';
  await page.addInitScript(({ key, persistentKey, version, fixture, session, corrupt }) => {
    sessionStorage.setItem(key, corrupt);
    localStorage.setItem(persistentKey, JSON.stringify({ version, data: fixture, session }));
  }, { key: PREVIEW_STORAGE_KEY, persistentKey: PREVIEW_PERSISTENT_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, fixture, session: PREVIEW_SYSTEM_ADMIN, corrupt });
  await gotoPreview(page, '/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewData(page)).toEqual(fixture);
  expect(await readPreviewSession(page)).toEqual(PREVIEW_SYSTEM_ADMIN);
  expect(await page.evaluate(key => sessionStorage.getItem(`${key}-recovery`), PREVIEW_STORAGE_KEY)).toBe(corrupt);
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
});

test('malformed remembered storage does not replace valid owner data in the current tab', async ({ page }) => {
  const fixture = createPopulatedTestData();
  await seedPopulatedPreview(page, fixture);
  await page.addInitScript(key => localStorage.setItem(key, '{invalid remembered data'), PREVIEW_PERSISTENT_STORAGE_KEY);
  await gotoPreview(page, '/login');
  await expect(page.getByLabel('الحساب', { exact: true })).toBeVisible();
  expect(await readPreviewData(page)).toEqual(fixture);
  expect(await readPreviewSession(page)).toBeNull();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await readPreviewData(page)).toEqual(fixture);
});

test('blocked session storage still restores remembered owner data from local storage', async ({ page }) => {
  const fixture = createPopulatedTestData();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ persistentKey, version, fixture, session }) => {
    localStorage.setItem(persistentKey, JSON.stringify({ version, data: fixture, session }));
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
  }, { persistentKey: PREVIEW_PERSISTENT_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, fixture, session: PREVIEW_SYSTEM_ADMIN });
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
