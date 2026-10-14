import { test, expect, type Page, type Route } from '@playwright/test';
import { createInitialData } from '../../src/lib/mock-data';
import { createPopulatedTestData } from '../fixtures/populated-data';
import type { MutationRequest, RemoteSnapshot } from '../../src/lib/server-contract';
import type { DemoSession } from '../../src/lib/types';

const legacy = {
  'centerpro-ui-preview-v4': 'untouched session business records',
  'centerpro-ui-preview-v3': 'untouched previous version',
  'centerpro-ui-preview-data-v2': 'untouched durable business records',
  'centerpro-ui-preview-remembered-v2': 'untouched legacy session',
  'centerpro-local-auth-v1': 'untouched legacy credentials',
};
const owner: DemoSession = { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام', authVersion: 1 };
function state(session: DemoSession | null = owner, data = createPopulatedTestData()): RemoteSnapshot {
  return { data, session, revision: 11, ready: true, remembered: false, systemConfigured: true, systemUsername: 'remote-owner', qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false, today: '2026-10-12', month: '2026-10', serverTime: '2026-10-12T18:00:00.000Z', backend: 'neon', pendingImport: false };
}
async function preserveLegacy(page: Page) {
  await page.addInitScript(values => {
    for (const [key, value] of Object.entries(values)) (key.includes('preview-v') ? sessionStorage : localStorage).setItem(key, value);
    const accesses: string[] = [];
    Object.defineProperty(window, '__legacyAccesses', { value: accesses });
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { value: function (key: string, value?: string) {
        if (Object.hasOwn(values, key)) accesses.push(`${method}:${key}`);
        return method === 'setItem' ? Reflect.apply(original, this, [key, value]) : Reflect.apply(original, this, [key]);
      } });
    }
  }, legacy);
}
async function expectUntouched(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __legacyAccesses: string[] }).__legacyAccesses)).toEqual([]);
  expect(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, (key.includes('preview-v') ? sessionStorage : localStorage).getItem(key)])), Object.keys(legacy))).toEqual(legacy);
}
async function transport(page: Page, read: () => RemoteSnapshot, post?: (route: Route, pathname: string) => Promise<void>) {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/state' && route.request().method() === 'GET') return route.fulfill({ json: read() });
    if (post) return post(route, pathname);
    return route.fulfill({ status: 404, json: { error: 'طلب غير متوقع في الاختبار' } });
  });
}

test('pending import blocks public setup and leaves every legacy record untouched', async ({ page }) => {
  await preserveLegacy(page);
  const pending = { ...state(null, createInitialData()), systemConfigured: false, pendingImport: true };
  await transport(page, () => pending);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'بانتظار استيراد بيانات المركز' })).toBeVisible();
  await expect(page.getByText('تم ربط النظام بقاعدة البيانات.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إنشاء حساب مدير النظام', exact: false })).toHaveCount(0);
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveCount(0);
  await expectUntouched(page);
});

test('unavailable server fails closed with retry instead of using browser data or bootstrap', async ({ page }) => {
  await preserveLegacy(page);
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'قاعدة البيانات غير متاحة حالياً.' } }));
  await page.goto('/login');
  await expect(page.locator('.login-form-wrap').getByRole('alert')).toContainText('قاعدة البيانات غير متاحة');
  await expect(page.getByRole('button', { name: 'إعادة الاتصال' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'إنشاء حساب مدير النظام', exact: false })).toHaveCount(0);
  await expectUntouched(page);
});

test('employee login routes using the authenticated server session despite empty public data', async ({ page }) => {
  await preserveLegacy(page);
  let snapshot = state(null, createInitialData());
  const employee = createPopulatedTestData().employees.find(item => item.role === 'EMPLOYEE')!;
  await transport(page, () => snapshot, async (route, path) => {
    expect(path).toBe('/api/auth/login');
    expect(route.request().postDataJSON()).toEqual({ username: employee.username, password: 'Only-a-test-password-19', remember: false });
    const ownData = createInitialData();
    ownData.employees = [employee];
    ownData.departments = createPopulatedTestData().departments.filter(item => item.id === employee.departmentId);
    snapshot = state({ kind: 'EMPLOYEE', role: 'EMPLOYEE', employeeId: employee.id, name: employee.name, authVersion: 1 }, ownData);
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: false })).toBeEnabled();
  await page.getByLabel('اسم المستخدم', { exact: false }).fill(employee.username);
  await page.getByLabel('كلمة المرور', { exact: false }).fill('Only-a-test-password-19');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: false }).click();
  await expect(page).toHaveURL(/\/employee$/);
  await expect(page.getByRole('link', { name: 'الأقسام', exact: true })).toHaveCount(0);
  await expectUntouched(page);
});

test('employee creation sends one atomic record and password command and waits for server acknowledgement', async ({ page }) => {
  await preserveLegacy(page);
  let snapshot = state();
  let command: MutationRequest | undefined;
  let pendingRoute: Route | undefined;
  await transport(page, () => snapshot, async (route, path) => {
    expect(path).toBe('/api/mutations');
    command = route.request().postDataJSON() as MutationRequest;
    pendingRoute = route;
  });
  await page.goto('/employees');
  await page.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('الاسم الكامل', { exact: false }).fill('موظف اختبار الربط');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('رقم الهاتف', { exact: true }).fill('812345678');
  await dialog.getByLabel('رقم هاتف ولي الأمر', { exact: false }).fill('912345678');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('القسم', { exact: false }).selectOption(snapshot.data.departments[0].id);
  await expect(dialog.getByLabel('تاريخ المباشرة', { exact: false })).toHaveValue('2026-10-12');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByLabel('اسم المستخدم', { exact: false }).fill('REMOTE_NEW_EMPLOYEE');
  await dialog.getByLabel('كلمة المرور الأولية', { exact: false }).fill('Atomic-test-password-73');
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByRole('button', { name: 'إضافة الموظف', exact: true }).click();
  await expect.poll(() => Boolean(command)).toBe(true);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'إضافة الموظف', exact: true })).toBeDisabled();
  expect(command!.revision).toBe(11);
  expect(command!.changes).toHaveLength(1);
  expect(command!.changes[0].collection).toBe('employees');
  const employee = command!.changes[0].upsert![0];
  expect(command!.password).toEqual({ employeeId: employee.id, value: 'Atomic-test-password-73' });
  expect(JSON.stringify(command!.audit)).not.toContain('Atomic-test-password-73');
  expect(employee).not.toHaveProperty('password');
  snapshot = { ...snapshot, revision: 12, data: { ...snapshot.data, employees: [...snapshot.data.employees, employee as unknown as typeof snapshot.data.employees[number]] } };
  await pendingRoute!.fulfill({ json: snapshot });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('تمت إضافة الموظف وحساب الدخول بنجاح.', { exact: true })).toBeVisible();
  await expectUntouched(page);
});

test('failed and conflicting settings saves preserve the draft and only confirmed writes show success', async ({ page }) => {
  let snapshot = state();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, path) => {
    expect(path).toBe('/api/mutations');
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) return route.fulfill({ status: 503, json: { error: 'لم يتم حفظ الإعدادات؛ الخادم غير متاح.' } });
    if (commands.length === 2) {
      snapshot = { ...snapshot, revision: 12, data: { ...snapshot.data, settings: { ...snapshot.data.settings, centerName: 'تعديل مسؤول آخر' } } };
      return route.fulfill({ status: 409, json: { error: 'تغيرت البيانات. راجع التحديث ثم أعد المحاولة.' } });
    }
    snapshot = { ...snapshot, revision: 13, data: { ...snapshot.data, settings: commands[2].settings! } };
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/settings');
  await page.getByLabel('اسم المركز', { exact: false }).fill('مسودة المركز المطلوبة');
  const save = page.getByRole('button', { name: 'حفظ الإعدادات', exact: true });
  await save.click();
  await expect(page.locator('form').getByRole('alert')).toContainText('لم يتم حفظ');
  await expect(page.getByText('تم حفظ الإعدادات وتسجيل التغيير في سجل العمليات.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('اسم المركز', { exact: false })).toHaveValue('مسودة المركز المطلوبة');
  await save.click();
  await expect(page.locator('form').getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(page.getByLabel('اسم المركز', { exact: false })).toHaveValue('مسودة المركز المطلوبة');
  await save.click();
  await expect(page.locator('form').getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(commands).toHaveLength(2);
  await page.getByRole('button', { name: 'إلغاء التغييرات', exact: true }).click();
  await expect(page.getByLabel('اسم المركز', { exact: false })).toHaveValue('تعديل مسؤول آخر');
  await page.getByLabel('اسم المركز', { exact: false }).fill('مسودة بعد مراجعة تعديل المسؤول');
  await save.click();
  await expect(page.getByText('تم حفظ الإعدادات وتسجيل التغيير في سجل العمليات.', { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 11, 12]);
});

test('logout failure keeps the authenticated screen until server logout succeeds', async ({ page }) => {
  let snapshot = state();
  let count = 0;
  await transport(page, () => snapshot, async (route, path) => {
    expect(path).toBe('/api/auth/logout');
    if (++count === 1) return route.fulfill({ status: 503, json: { error: 'تعذر إنهاء الجلسة الآن.' } });
    snapshot = state(null, createInitialData());
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByText('تعذر إنهاء الجلسة الآن.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
