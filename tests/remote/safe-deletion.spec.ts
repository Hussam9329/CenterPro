import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { createInitialData, createTestData } from '../../src/lib/mock-data';
import type { MutationRequest, RemoteSnapshot } from '../../src/lib/server-contract';

const unusedDepartmentId = 'department-unused-transport';
const unusedDepartmentName = 'قسم اختبار الحذف';

function initialSnapshot(): RemoteSnapshot {
  const seeded = createTestData();
  const employee = seeded.employees[0];
  const day = seeded.workdays[0];
  return {
    data: {
      ...createInitialData(),
      departments: [seeded.departments[0], { ...seeded.departments[0], id: unusedDepartmentId, name: unusedDepartmentName }],
      employees: [employee],
      workdays: [{ ...day, departmentIds: [employee.departmentId], overrides: { [employee.id]: 'INCLUDE' } }],
      attendance: [seeded.attendance.find(record => record.employeeId === employee.id && record.workdayId === day.id)!],
    },
    session: { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام', authVersion: 1 },
    revision: 11, ready: true, remembered: false, systemConfigured: true, systemUsername: 'remote-owner',
    qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false,
    today: '2026-09-28', month: '2026-09', serverTime: '2026-09-28T18:00:00.000Z', backend: 'neon', pendingImport: false,
  };
}

async function transport(page: Page, read: () => RemoteSnapshot, mutate: (route: Route, command: MutationRequest) => Promise<void>) {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/state' && route.request().method() === 'GET') return route.fulfill({ json: read() });
    expect(pathname).toBe('/api/mutations');
    expect(route.request().method()).toBe('POST');
    return mutate(route, route.request().postDataJSON() as MutationRequest);
  });
}

async function prepareDeletion(page: Page, label: string, reason: string): Promise<Locator> {
  await page.getByRole('button', { name: `حذف ${label}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('سبب الحذف', { exact: false }).fill(reason);
  await dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: false }).fill('حذف');
  return dialog;
}

function removeUnusedDepartment(snapshot: RemoteSnapshot): RemoteSnapshot {
  return { ...snapshot, revision: snapshot.revision + 1, data: { ...snapshot.data, departments: snapshot.data.departments.filter(item => item.id !== unusedDepartmentId) } };
}

test('cascade deletion sends only an intent, waits for acknowledgement and uses the returned revision', async ({ page }) => {
  let snapshot = initialSnapshot();
  const employee = snapshot.data.employees[0];
  const commands: MutationRequest[] = [];
  let pending: Route | undefined;
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) { pending = route; return; }
    snapshot = removeUnusedDepartment(snapshot);
    await route.fulfill({ json: snapshot });
  });
  await page.goto('/employees');
  const dialog = await prepareDeletion(page, employee.name, '  حساب أضيف بالخطأ  ');
  await expect(dialog.getByText('سجل حضور: 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('أيام ستُزال منها استثناءات الموظف: 1', { exact: true })).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true });
  await confirm.click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'إلغاء', exact: true })).toBeDisabled();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('row', { includeHidden: true }).filter({ hasText: employee.name })).toBeVisible();
  await expect(page.getByText('تم حذف موظف وتوثيق العملية.', { exact: true })).toHaveCount(0);
  expect(Object.keys(commands[0]).sort()).toEqual(['audit', 'changes', 'deletion', 'revision']);
  expect(commands[0].changes).toEqual([]);
  expect(commands[0].deletion).toEqual({ collection: 'employees', id: employee.id, reason: 'حساب أضيف بالخطأ', confirmation: 'حذف' });
  expect(commands[0].revision).toBe(11);
  // The response is the canonical server result. The browser never submits the
  // attendance cascade or workday override changes it showed in the preview.
  snapshot = {
    ...snapshot, revision: 12,
    data: { ...snapshot.data, employees: [], attendance: [], workdays: snapshot.data.workdays.map(day => ({ ...day, overrides: {} })) },
  };
  await pending!.fulfill({ json: snapshot });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: employee.name })).toHaveCount(0);
  await expect(page.getByText('تم حذف موظف وتوثيق العملية.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'الأقسام', exact: true }).click();
  const nextDialog = await prepareDeletion(page, unusedDepartmentName, 'قسم غير مستخدم');
  await nextDialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await expect(nextDialog).toBeHidden();
  expect(commands.map(command => command.revision)).toEqual([11, 12]);
  expect(commands[1].changes).toEqual([]);
  await expect(page.getByRole('heading', { name: unusedDepartmentName, exact: true })).toHaveCount(0);
});

test('rejected deletion preserves the record, reason and confirmation until a retry succeeds', async ({ page }) => {
  let snapshot = initialSnapshot();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) return route.fulfill({ status: 503, json: { error: 'تعذر تنفيذ الحذف؛ الخادم غير متاح.' } });
    snapshot = removeUnusedDepartment(snapshot);
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/departments');
  const reason = 'قسم أنشئ بالخطأ';
  const dialog = await prepareDeletion(page, unusedDepartmentName, reason);
  const confirm = dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true });
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('تعذر تنفيذ الحذف');
  await expect(dialog.getByLabel('سبب الحذف', { exact: false })).toHaveValue(reason);
  await expect(dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: false })).toHaveValue('حذف');
  await expect(page.getByRole('heading', { name: unusedDepartmentName, exact: true, includeHidden: true })).toBeVisible();
  await expect(page.getByText('تم حذف قسم وتوثيق العملية.', { exact: true })).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('تم حذف قسم وتوثيق العملية.', { exact: true })).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  await expect(page.getByRole('heading', { name: unusedDepartmentName, exact: true })).toHaveCount(0);
});

test('revision conflict cannot produce a false deletion or retry without reopening the confirmation', async ({ page }) => {
  let snapshot = initialSnapshot();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) {
      snapshot = {
        ...snapshot, revision: 12,
        data: { ...snapshot.data, departments: snapshot.data.departments.map(item => item.id === unusedDepartmentId ? { ...item, description: 'عدّل مسؤول آخر هذا القسم' } : item) },
      };
      return route.fulfill({ status: 409, json: { error: 'تغيّرت البيانات. راجعها قبل الحذف.' } });
    }
    snapshot = removeUnusedDepartment(snapshot);
    return route.fulfill({ json: snapshot });
  });
  await page.goto('/departments');
  const reason = 'قسم مكرر في النظام';
  const dialog = await prepareDeletion(page, unusedDepartmentName, reason);
  const confirm = dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true });
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(dialog.getByLabel('سبب الحذف', { exact: false })).toHaveValue(reason);
  await expect(dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: false })).toHaveValue('حذف');
  await expect(page.getByRole('heading', { name: unusedDepartmentName, exact: true, includeHidden: true })).toBeVisible();
  await expect(page.getByText('تم حذف قسم وتوثيق العملية.', { exact: true })).toHaveCount(0);
  await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(commands).toHaveLength(1);
  await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('عدّل مسؤول آخر هذا القسم', { exact: true })).toBeVisible();
  const reviewed = await prepareDeletion(page, unusedDepartmentName, 'حذف بعد مراجعة تعديل المسؤول');
  await reviewed.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await expect(reviewed).toBeHidden();
  await expect(page.getByText('تم حذف قسم وتوثيق العملية.', { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 12]);
  await expect(page.getByRole('heading', { name: unusedDepartmentName, exact: true })).toHaveCount(0);
});
