import { test, expect, type Page, type Route } from '@playwright/test';
import { createInitialData, createTestData } from '../../src/lib/mock-data';
import { diffData, type MutationRequest, type RemoteSnapshot } from '../../src/lib/server-contract';
import type { AccountPermission, AccountPermissionFeature, DemoData, DemoSession } from '../../src/lib/types';
import { applyMutation } from '../../src/server/domain';
import { projectData } from '../../src/server/projection';

const owner: DemoSession = { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' };
const now = new Date('2026-09-28T11:00:00.000Z');
const viewOnly: AccountPermission = { view: true, create: false, edit: false, delete: false };

/** HTTP is synthetic; authorization, projection and mutation are the actual
 * server functions. No database, production account or external service is used. */
async function permissionsTransport(page: Page, withManager = false) {
  const seeded = createTestData();
  let data: DemoData = {
    ...createInitialData(), departments: structuredClone(seeded.departments),
    employees: [seeded.employees[0], seeded.employees[1], seeded.employees[4]],
  };
  const [target, peer, otherDepartment] = data.employees;
  for (const employee of data.employees) delete employee.permissions;
  const manager = { ...seeded.employees[2], id: 'profile-manager', code: 'CP-0100', username: 'PROFILE_MANAGER', name: 'مدير مراجعة الملفات', role: 'ADMIN' as const };
  if (withManager) data.employees.push(manager);
  data.departments[1].name = 'المتابعة';
  data.bonuses.push({ id: 'peer-bonus', employeeId: peer.id, amount: 15000, date: '2026-09-28', reason: 'مكافأة زميل للمراجعة', createdBy: owner.name, createdAt: now.toISOString() });
  data.deductions.push({ id: 'peer-deduction', employeeId: peer.id, amount: 5000, date: '2026-09-28', type: 'خصم إداري', customType: '', reason: 'خصم زميل للمراجعة', createdBy: owner.name, createdAt: now.toISOString() });
  let session = owner;
  let revision = 11;
  let reads = 0;
  let hold = false;
  let held: { route: Route; command: MutationRequest } | undefined;
  let failure: { status: number; message: string } | undefined;
  const commands: MutationRequest[] = [];
  const snapshot = (): RemoteSnapshot => ({
    data: projectData(data, session), session, revision, ready: true, remembered: false,
    systemConfigured: true, systemUsername: 'permission-owner', qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false,
    today: '2026-09-28', month: '2026-09', serverTime: now.toISOString(), backend: 'neon', pendingImport: false,
  });
  const apply = (command: MutationRequest, actor = session) => {
    data = applyMutation(data, actor, command, now);
    revision += 1;
  };
  async function acknowledge(route: Route, command: MutationRequest) {
    try { apply(command); await route.fulfill({ json: snapshot() }); }
    catch (error) { await route.fulfill({ status: 403, json: { error: error instanceof Error ? error.message : 'غير مسموح' } }); }
  }
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/state' && route.request().method() === 'GET') { reads += 1; return route.fulfill({ json: snapshot() }); }
    expect(pathname).toBe('/api/mutations');
    expect(route.request().method()).toBe('POST');
    const command = route.request().postDataJSON() as MutationRequest;
    commands.push(command);
    if (command.revision !== revision) return route.fulfill({ status: 409, json: { error: 'تغيّرت البيانات من جهاز آخر. راجع الصلاحيات قبل الحفظ.' } });
    if (failure) { const result = failure; failure = undefined; return route.fulfill({ status: result.status, json: { error: result.message } }); }
    if (hold) { hold = false; held = { route, command }; return; }
    return acknowledge(route, command);
  });
  return {
    target, peer, otherDepartment, manager, commands, snapshot, data: () => data, reads: () => reads,
    asOwner: () => { session = owner; },
    asEmployee: (id: string) => { const employee = data.employees.find(item => item.id === id)!; session = { kind: 'EMPLOYEE', role: employee.role, name: employee.name, employeeId: id }; },
    holdNext: () => { hold = true; },
    release: async () => { expect(held).toBeDefined(); const pending = held!; held = undefined; await acknowledge(pending.route, pending.command); },
    failNext: () => { failure = { status: 503, message: 'تعذر حفظ الصلاحيات؛ حاول مجدداً.' }; },
    externalGrant: (id: string, feature: AccountPermissionFeature, permission: AccountPermission) => {
      const after = structuredClone(data);
      const employee = after.employees.find(item => item.id === id)!;
      employee.permissions = { ...employee.permissions, [feature]: permission };
      apply(diffData(data, after, revision), owner);
    },
  };
}

async function selectAccount(page: Page, employeeId: string) {
  await page.goto('/permissions');
  await page.getByRole('combobox', { name: 'حساب الموظف', exact: true }).selectOption(employeeId);
  await expect(page.getByRole('heading', { name: 'صلاحيات القوائم', exact: true })).toBeVisible();
}

async function expectFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const overflow = await page.locator('main form, main fieldset, main .card').evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return [];
    return bounds.left >= -1 && bounds.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1 ? [] : [element.textContent?.slice(0, 80)];
  }));
  expect(overflow, 'Permission controls and financial records fit without hidden clipping').toEqual([]);
}

test('owner grants view-only access per account across departments without enabling actions or exposing peer private data', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const server = await permissionsTransport(page);
  await selectAccount(page, server.target.id);
  await expect(page.getByRole('checkbox', { name: 'عرض المكافآت', exact: true })).not.toBeChecked();
  for (const action of ['إضافة', 'تعديل', 'حذف']) await expect(page.getByRole('checkbox', { name: `${action} المكافآت`, exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'عرض المكافآت', exact: true }).check();
  for (const action of ['إضافة', 'تعديل', 'حذف']) await expect(page.getByRole('checkbox', { name: `${action} المكافآت`, exact: true })).not.toBeChecked();
  await expectFits(page);
  server.holdNext();
  await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
  await expect.poll(() => server.commands.length).toBe(1);
  await expect(page.getByRole('checkbox', { name: 'عرض المكافآت', exact: true })).toBeDisabled();
  expect(server.data().employees.find(employee => employee.id === server.target.id)?.permissions).toBeUndefined();
  await server.release();
  await expect(page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true })).toBeDisabled();
  expect(server.data().employees.find(employee => employee.id === server.target.id)?.permissions?.BONUSES).toEqual(viewOnly);
  expect(server.data().employees.find(employee => employee.id === server.peer.id)?.permissions).toBeUndefined();

  await selectAccount(page, server.otherDepartment.id);
  await page.getByRole('checkbox', { name: 'عرض الخصومات', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
  await expect.poll(() => server.data().employees.find(employee => employee.id === server.otherDepartment.id)?.permissions?.DEDUCTIONS).toEqual(viewOnly);

  server.asEmployee(server.target.id);
  await page.goto('/employee/bonuses?add=1');
  await expect(page.getByRole('heading', { name: 'المكافآت', exact: true })).toBeVisible();
  await expect(page.getByText('مكافأة زميل للمراجعة', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const action of ['إضافة', 'تعديل', 'حذف']) await expect(page.getByRole('button', { name: new RegExp(`^${action} مكافأة`) })).toHaveCount(0);
  await expectFits(page);
  const peer = server.snapshot().data.employees.find(employee => employee.id === server.peer.id)!;
  expect(peer.name).toBe(server.peer.name);
  expect(peer.phone).toBe(''); expect(peer.address).toBe(''); expect(peer.username).toBe('');
  expect(server.snapshot().data.deductions).toEqual([]);
  await page.goto('/employee/deductions');
  await expect(page.getByRole('heading', { name: 'لا تملك صلاحية عرض الخصومات', exact: true })).toBeVisible();

  server.asEmployee(server.peer.id);
  await page.goto('/employee/bonuses');
  await expect(page.getByRole('heading', { name: 'لا تملك صلاحية عرض المكافآت', exact: true })).toBeVisible();
  server.asEmployee(server.otherDepartment.id);
  await page.goto('/employee/deductions');
  await expect(page.getByRole('heading', { name: 'الخصومات', exact: true })).toBeVisible();
  await expect(page.getByText('خصم زميل للمراجعة', { exact: true }).filter({ visible: true })).toBeVisible();
  for (const action of ['إضافة', 'تعديل', 'حذف']) await expect(page.getByRole('button', { name: new RegExp(`^${action} خصم`) })).toHaveCount(0);
});

test('granted create and delete are separate from edit and a view-only forged request is rejected by the real domain', async ({ page }) => {
  const server = await permissionsTransport(page);
  await selectAccount(page, server.target.id);
  await page.getByRole('checkbox', { name: 'عرض المكافآت', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
  await expect.poll(() => server.data().employees[0].permissions?.BONUSES).toEqual(viewOnly);
  server.asEmployee(server.target.id);
  await page.goto('/employee/bonuses');
  await expect(page.getByRole('heading', { name: 'المكافآت', exact: true })).toBeVisible();
  const forged = { ...server.data().bonuses[0], id: 'unauthorized-bonus' };
  const rejected = await page.evaluate(async command => {
    const response = await fetch('/api/mutations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    return response.status;
  }, { revision: server.snapshot().revision, changes: [{ collection: 'bonuses', upsert: [forged] }] });
  expect(rejected).toBe(403);
  expect(server.data().bonuses).toHaveLength(1);

  server.asOwner();
  await selectAccount(page, server.target.id);
  await page.getByRole('checkbox', { name: 'إضافة المكافآت', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
  await expect.poll(() => server.data().employees[0].permissions?.BONUSES?.create).toBe(true);
  server.asEmployee(server.target.id);
  await page.goto('/employee/bonuses');
  await page.getByRole('button', { name: 'إضافة مكافأة', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إضافة مكافأة', exact: true });
  await dialog.getByLabel('الموظف', { exact: false }).selectOption(server.peer.id);
  await dialog.getByLabel('المبلغ (د.ع)', { exact: false }).fill('25000');
  await dialog.getByLabel('سبب مكافأة', { exact: false }).fill('مكافأة من حساب مفوض');
  await dialog.getByRole('button', { name: 'حفظ مكافأة', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(server.data().bonuses.find(bonus => bonus.reason === 'مكافأة من حساب مفوض')).toMatchObject({ amount: 25000, employeeId: server.peer.id, createdBy: server.target.name });
  await expect(page.getByRole('button', { name: /^تعديل مكافأة/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^حذف مكافأة/ })).toHaveCount(0);

  server.asOwner();
  await selectAccount(page, server.target.id);
  await page.getByRole('checkbox', { name: 'إضافة المكافآت', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'حذف المكافآت', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
  await expect.poll(() => server.data().employees[0].permissions?.BONUSES).toEqual({ ...viewOnly, delete: true });
  server.asEmployee(server.target.id);
  await page.goto('/employee/bonuses');
  await expect(page.getByRole('button', { name: 'إضافة مكافأة', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^تعديل مكافأة/ })).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'مكافأة من حساب مفوض' });
  await row.getByRole('button', { name: /^حذف مكافأة/ }).click();
  const deletion = page.getByRole('dialog');
  await deletion.getByLabel('سبب الحذف', { exact: false }).fill('مكافأة مكررة');
  await expect(deletion.getByLabel('اكتب كلمة حذف للتأكيد', { exact: false })).toHaveCount(0);
  await deletion.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await expect(deletion).toBeHidden();
  expect(server.data().bonuses).toHaveLength(1);
  expect(server.commands.at(-1)?.deletion?.collection).toBe('bonuses');
});

test('failed permission drafts survive background refresh and conflicts require explicit cancellation before a fresh save', async ({ page }) => {
  const server = await permissionsTransport(page);
  await selectAccount(page, server.target.id);
  const view = page.getByRole('checkbox', { name: 'عرض المكافآت', exact: true });
  await view.check();
  server.failNext();
  const save = page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true });
  await save.click();
  await expect(page.getByRole('form', { name: `صلاحيات ${server.target.name}`, exact: true }).getByRole('alert')).toContainText('تعذر حفظ الصلاحيات');
  await expect(view).toBeChecked();
  expect(server.data().employees[0].permissions).toBeUndefined();

  server.externalGrant(server.target.id, 'DEDUCTIONS', viewOnly);
  const previousReads = server.reads();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => server.reads()).toBeGreaterThan(previousReads);
  await expect(view).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'عرض الخصومات', exact: true })).not.toBeChecked();
  await save.click();
  await expect(page.getByRole('form', { name: `صلاحيات ${server.target.name}`, exact: true }).getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(view).toBeChecked();
  const attempted = server.commands.length;
  await save.click();
  await expect(page.getByRole('form', { name: `صلاحيات ${server.target.name}`, exact: true }).getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(server.commands).toHaveLength(attempted);
  await page.getByRole('button', { name: 'إلغاء التغييرات', exact: true }).click();
  await expect(view).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'عرض الخصومات', exact: true })).toBeChecked();
  await expect(save).toBeDisabled();
  await view.check();
  await save.click();
  await expect(save).toBeDisabled();
  expect(server.data().employees[0].permissions?.BONUSES).toEqual(viewOnly);
  expect(server.data().employees[0].permissions?.DEDUCTIONS).toEqual(viewOnly);
  expect(server.commands.map(command => command.revision)).toEqual([11, 11, 12]);
});

for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
  test(`${role} profile and password edits preserve explicitly granted account permissions in the submitted and canonical employee`, async ({ page }) => {
    const server = await permissionsTransport(page, true);
    await selectAccount(page, server.target.id);
    for (const feature of ['المكافآت', 'الخصومات', 'التدقيق']) await page.getByRole('checkbox', { name: `عرض ${feature}`, exact: true }).check();
    await page.getByRole('checkbox', { name: 'إضافة المكافآت', exact: true }).check();
    await page.getByRole('checkbox', { name: 'تعديل الخصومات', exact: true }).check();
    await page.getByRole('checkbox', { name: 'حذف التدقيق', exact: true }).check();
    await page.getByRole('button', { name: 'حفظ الصلاحيات', exact: true }).click();
    const granted = {
      BONUSES: { ...viewOnly, create: true },
      DEDUCTIONS: { ...viewOnly, edit: true },
      AUDIT_REVIEW: { ...viewOnly, delete: true },
    };
    await expect.poll(() => server.data().employees[0].permissions).toEqual(granted);

    if (role === 'ADMIN') server.asEmployee(server.manager.id);
    await page.goto(`/employees/${server.target.id}`);
    await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'تعديل بيانات الموظف', exact: true });
    const name = role === 'ADMIN' ? 'ابرار حقي بعد مراجعة المدير' : 'ابرار حقي بعد مراجعة المشرف';
    await form.getByLabel('الاسم الكامل', { exact: false }).fill(name);
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    if (role === 'ADMIN') await expect(form.getByLabel('الصلاحية', { exact: true })).toBeDisabled();
    const password = 'permission-profile-test-only';
    await form.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(password);
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

    const command = server.commands.at(-1)!;
    const submitted = command.changes.find(change => change.collection === 'employees')?.upsert?.[0];
    expect(submitted).toMatchObject({ id: server.target.id, name, permissions: granted });
    expect(command.password).toEqual({ employeeId: server.target.id, value: password });
    expect(command.audit?.oldValues?.permissions).toEqual(granted);
    expect(command.audit?.newValues?.permissions).toEqual(granted);
    expect(server.data().employees.find(employee => employee.id === server.target.id)).toMatchObject({ name, permissions: granted });
    expect(JSON.stringify(server.data())).not.toContain(password);
  });
}
