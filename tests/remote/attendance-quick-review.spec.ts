import { test, expect, type Page, type Route } from '@playwright/test';
import { createInitialData, createTestData } from '../../src/lib/mock-data';
import type { MutationRequest, RemoteSnapshot } from '../../src/lib/server-contract';
import type { AttendanceRecord, AttendanceStatus, Workday } from '../../src/lib/types';

const success = 'تم تسجيل الحضور بوقت بدء الدوام. يمكن تغيير الوقت من «مراجعة».';

function initialSnapshot(status: AttendanceStatus = 'UNRESOLVED'): RemoteSnapshot {
  const seeded = createTestData();
  const employee = seeded.employees[0];
  const day = { ...seeded.workdays[0], startTime: '15:12:30', departmentIds: [employee.departmentId], overrides: status === 'EXEMPT' ? { [employee.id]: 'EXCLUDE' as const } : {} };
  const attendance: AttendanceRecord = {
    id: 'attendance-quick-review-transport', employeeId: employee.id, workdayId: day.id, status,
    checkIn: status === 'PRESENT' ? '2026-09-01T12:27:42.000Z' : null,
    latenessSeconds: status === 'PRESENT' ? 912 : 0,
    source: status === 'PRESENT' ? 'QR' : null,
    reason: status === 'EXEMPT' ? 'استثناء سابق' : '', updatedAt: '2026-09-01T13:00:00.000Z',
  };
  return {
    data: { ...createInitialData(), departments: [seeded.departments[0]], employees: [employee], workdays: [day], attendance: [attendance] },
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

function acknowledged(snapshot: RemoteSnapshot, command: MutationRequest): RemoteSnapshot {
  const attendance = command.changes.find(change => change.collection === 'attendance')?.upsert as AttendanceRecord[] | undefined;
  const workdays = command.changes.find(change => change.collection === 'workdays')?.upsert as Workday[] | undefined;
  return {
    ...snapshot, revision: snapshot.revision + 1,
    data: { ...snapshot.data, attendance: attendance || snapshot.data.attendance, workdays: workdays || snapshot.data.workdays },
  };
}

function statusField(page: Page, snapshot: RemoteSnapshot) {
  return page.getByRole('combobox', { name: `تغيير حالة ${snapshot.data.employees[0].name}`, exact: true });
}

test('quick presence submits attendance and exemption override atomically and waits for acknowledgement', async ({ page }) => {
  let snapshot = initialSnapshot('EXEMPT');
  const commands: MutationRequest[] = [];
  let pending: Route | undefined;
  await transport(page, () => snapshot, async (route, command) => { commands.push(command); pending = route; });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('PRESENT');
  await expect.poll(() => commands.length).toBe(1);
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('aria-busy', 'true');
  await expect(select).toHaveValue('EXEMPT');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  const command = commands[0];
  expect(command.revision).toBe(11);
  expect(command.changes.map(change => change.collection).sort()).toEqual(['attendance', 'workdays']);
  expect(command.changes.every(change => change.upsert?.length === 1 && !change.remove)).toBe(true);
  expect(command.changes.find(change => change.collection === 'attendance')!.upsert![0]).toMatchObject({
    id: snapshot.data.attendance[0].id, employeeId: snapshot.data.employees[0].id, workdayId: snapshot.data.workdays[0].id,
    status: 'PRESENT', checkIn: '2026-09-01T12:12:30.000Z', latenessSeconds: 0, source: 'MANUAL', reason: 'تسجيل سريع بوقت بدء الدوام',
  });
  expect(command.changes.find(change => change.collection === 'workdays')!.upsert![0].overrides).toEqual({ [snapshot.data.employees[0].id]: 'INCLUDE' });
  expect(command.audit).toMatchObject({ action: 'تغيير سريع لحالة الحضور', oldValues: { status: 'EXEMPT' }, newValues: { status: 'PRESENT' } });
  snapshot = acknowledged(snapshot, command);
  await pending!.fulfill({ json: snapshot });
  await expect(select).toHaveValue('PRESENT');
  await expect(select).toBeEnabled();
  await expect(page.getByText(success, { exact: true })).toBeVisible();
  await expect(page.locator('.desktop-table').getByText('تسجيل سريع بوقت بدء الدوام', { exact: true })).toBeVisible();
});

test('failed quick presence leaves the confirmed status intact and can be retried', async ({ page }) => {
  let snapshot = initialSnapshot();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) return route.fulfill({ status: 503, json: { error: 'تعذر حفظ الحضور؛ الخادم غير متاح.' } });
    snapshot = acknowledged(snapshot, command);
    return route.fulfill({ json: snapshot });
  });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('PRESENT');
  await expect(page.getByText('تعذر حفظ الحضور؛ الخادم غير متاح.', { exact: true })).toBeVisible();
  await expect(select).toHaveValue('UNRESOLVED');
  await expect(select).toBeEnabled();
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  await select.selectOption('PRESENT');
  await expect(select).toHaveValue('PRESENT');
  await expect(page.getByText(success, { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 11]);
  for (const command of commands) {
    expect(command.changes).toHaveLength(1);
    expect(command.changes[0]).toMatchObject({ collection: 'attendance', upsert: [{ status: 'PRESENT', checkIn: '2026-09-01T12:12:30.000Z', source: 'MANUAL' }] });
  }
});

test('quick revision conflict refreshes the canonical check-in and requires confirmation before its removal', async ({ page }) => {
  let snapshot = initialSnapshot();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) {
      snapshot = { ...initialSnapshot('PRESENT'), revision: 12 };
      return route.fulfill({ status: 409, json: { error: 'سُجّل حضور الموظف من جهاز آخر. راجع التسجيل.' } });
    }
    snapshot = acknowledged(snapshot, command);
    return route.fulfill({ json: snapshot });
  });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('PRESENT');
  await expect(page.getByText('سُجّل حضور الموظف من جهاز آخر. راجع التسجيل.', { exact: true })).toBeVisible();
  await expect(select).toHaveValue('PRESENT');
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(1);
  await select.selectOption('UNRESOLVED');
  const confirmation = page.getByRole('dialog', { name: 'إزالة تسجيل الحضور؟', exact: true });
  await expect(confirmation).toBeVisible();
  expect(commands).toHaveLength(1);
  await confirmation.getByRole('button', { name: 'إزالة الحضور', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(select).toHaveValue('UNRESOLVED');
  expect(commands.map(command => command.revision)).toEqual([11, 12]);
  expect(commands[1].audit).toMatchObject({ action: 'إزالة تسجيل حضور', oldValues: { status: 'PRESENT', checkIn: '2026-09-01T12:27:42.000Z', latenessSeconds: 912 } });
  expect(commands[1].changes).toEqual([{ collection: 'attendance', upsert: [expect.objectContaining({ status: 'UNRESOLVED', checkIn: null, source: null, latenessSeconds: 0 })] }]);
});

test('absence review retains its draft on failure and blocks a stale retry until the dialog is reopened', async ({ page }) => {
  let snapshot = initialSnapshot();
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) return route.fulfill({ status: 503, json: { error: 'تعذر حفظ مراجعة الغياب.' } });
    if (commands.length === 2) {
      snapshot = { ...initialSnapshot('UNEXCUSED'), revision: 12 };
      return route.fulfill({ status: 409, json: { error: 'تغيّرت حالة الحضور من جهاز آخر.' } });
    }
    snapshot = acknowledged(snapshot, command);
    return route.fulfill({ json: snapshot });
  });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('EXCUSED');
  const dialog = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
  await expect(dialog.getByRole('radio', { name: 'غياب بعذر', exact: true })).toBeChecked();
  expect(commands).toHaveLength(0);
  const reason = 'موعد طبي أبلغ الموظف عنه';
  await dialog.getByLabel('ملاحظة / سبب', { exact: true }).fill(reason);
  const save = dialog.getByRole('button', { name: 'حفظ التعديل', exact: true });
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('تعذر حفظ مراجعة الغياب');
  await expect(dialog.getByLabel('ملاحظة / سبب', { exact: true })).toHaveValue(reason);
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toHaveCount(0);
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(dialog.getByLabel('ملاحظة / سبب', { exact: true })).toHaveValue(reason);
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(commands).toHaveLength(2);
  await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(select).toHaveValue('UNEXCUSED');
  await select.selectOption('EXCUSED');
  await dialog.getByLabel('ملاحظة / سبب', { exact: true }).fill('مراجعة العذر بعد تحديث المسؤول');
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(select).toHaveValue('EXCUSED');
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 11, 12]);
  expect(commands[2].audit).toMatchObject({ oldValues: { status: 'UNEXCUSED' }, newValues: { status: 'EXCUSED', reason: 'مراجعة العذر بعد تحديث المسؤول' } });
});

test('failed removal shows its error in the preserved review and requires a fresh confirmation to retry', async ({ page }) => {
  let snapshot = initialSnapshot('PRESENT');
  const commands: MutationRequest[] = [];
  let pending: Route | undefined;
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) { pending = route; return; }
    snapshot = acknowledged(snapshot, command);
    return route.fulfill({ json: snapshot });
  });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('UNRESOLVED');
  const confirmation = page.getByRole('dialog', { name: 'إزالة تسجيل الحضور؟', exact: true });
  const confirm = confirmation.getByRole('button', { name: 'إزالة الحضور', exact: true });
  await expect(confirmation).toBeVisible();
  expect(commands).toHaveLength(0);
  await confirm.click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(confirm).toBeDisabled();
  await expect(confirmation.getByRole('button', { name: 'إلغاء', exact: true })).toBeDisabled();
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toHaveCount(0);
  await pending!.fulfill({ status: 503, json: { error: 'تعذر إزالة تسجيل الحضور.' } });
  await expect(confirmation).toBeHidden();
  const review = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByRole('alert')).toContainText('تعذر إزالة تسجيل الحضور');
  await expect(review.getByLabel('وقت الحضور', { exact: true })).toHaveValue('15:27:42');
  await expect(review.getByLabel('الحالة الجديدة', { exact: true })).toHaveValue('PRESENT');
  await review.getByLabel('ملاحظة / سبب', { exact: true }).fill('تسجيل حضور مكرر');
  await review.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
  await expect(confirmation).toBeVisible();
  expect(commands).toHaveLength(1);
  await confirm.click();
  await expect(confirmation).toBeHidden();
  await expect(review).toBeHidden();
  await expect(select).toHaveValue('UNRESOLVED');
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 11]);
  expect(commands[1].changes[0].upsert![0]).toMatchObject({ status: 'UNRESOLVED', checkIn: null, reason: 'تسجيل حضور مكرر' });
});

test('conflicting removal preserves the review but cannot overwrite a newer check-in until reopened', async ({ page }) => {
  let snapshot = initialSnapshot('PRESENT');
  const commands: MutationRequest[] = [];
  await transport(page, () => snapshot, async (route, command) => {
    commands.push(command);
    if (commands.length === 1) {
      snapshot = {
        ...snapshot, revision: 12,
        data: {
          ...snapshot.data,
          attendance: [{ ...snapshot.data.attendance[0], checkIn: '2026-09-01T12:39:30.000Z', latenessSeconds: 1620, reason: 'صحح مسؤول آخر وقت الحضور' }],
        },
      };
      return route.fulfill({ status: 409, json: { error: 'تغيّر تسجيل الحضور قبل الإزالة.' } });
    }
    snapshot = acknowledged(snapshot, command);
    return route.fulfill({ json: snapshot });
  });
  await page.goto(`/attendance/${snapshot.data.workdays[0].id}`);
  const select = statusField(page, snapshot);
  await select.selectOption('UNRESOLVED');
  const confirmation = page.getByRole('dialog', { name: 'إزالة تسجيل الحضور؟', exact: true });
  const confirm = confirmation.getByRole('button', { name: 'إزالة الحضور', exact: true });
  await confirmation.getByRole('button', { name: 'إلغاء', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
  const reason = 'مراجعة تسجيل أضيف بالخطأ';
  await review.getByLabel('ملاحظة / سبب', { exact: true }).fill(reason);
  await review.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
  expect(commands).toHaveLength(0);
  await confirm.click();
  await expect(confirmation).toBeHidden();
  await expect(review.getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(review.getByLabel('ملاحظة / سبب', { exact: true })).toHaveValue(reason);
  await expect(review.getByLabel('وقت الحضور', { exact: true })).toHaveValue('15:27:42');
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
  await confirm.click();
  await expect(confirmation).toBeHidden();
  await expect(review.getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(commands).toHaveLength(1);
  await review.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(select).toHaveValue('PRESENT');
  await expect(page.locator('.desktop-table').getByText('صحح مسؤول آخر وقت الحضور', { exact: true })).toBeVisible();
  await select.selectOption('UNRESOLVED');
  await confirm.click();
  await expect(confirmation).toBeHidden();
  await expect(review).toBeHidden();
  await expect(select).toHaveValue('UNRESOLVED');
  await expect(page.getByText('تم تحديث سجل الحضور.', { exact: true })).toBeVisible();
  expect(commands.map(command => command.revision)).toEqual([11, 12]);
  expect(commands[1].audit).toMatchObject({ action: 'إزالة تسجيل حضور', oldValues: { status: 'PRESENT', checkIn: '2026-09-01T12:39:30.000Z', latenessSeconds: 1620 } });
});
