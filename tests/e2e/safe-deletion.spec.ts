import type { Locator, Page } from '@playwright/test';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { AUTH_STORAGE_KEY, test, expect, gotoPreview, loginAccount, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const employeeName = 'علي محمد حسن';
const reason = 'أضيف السجل بالخطأ أثناء المراجعة';

function deletionFixture() {
  const data = createPopulatedTestData();
  // Use only an open unpaid month for allowed deletion cases. Archived and paid
  // safeguards are covered separately with the original historical fixture.
  data.workdays = data.workdays.filter(day => day.date.startsWith('2026-09'));
  data.attendance = data.attendance.filter(row => data.workdays.some(day => day.id === row.workdayId));
  data.deductions = data.deductions.filter(row => row.date.startsWith('2026-09'));
  data.bonuses = data.bonuses.filter(row => row.date.startsWith('2026-09'));
  data.months = data.months.filter(month => month.state === 'OPEN');
  data.payments = [];
  const timestamp = '2026-09-28T08:00:00.000Z';
  data.evaluationSeasons = [{ id: 'delete-season', name: 'موسم اختبار الحذف', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationCycles = [{ id: 'delete-cycle', seasonId: 'delete-season', name: 'دورة اختبار الحذف', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationExams = [{ id: 'delete-exam', cycleId: 'delete-cycle', name: 'امتحان اختبار الحذف', date: '2026-09-28', state: 'OPEN', note: '', createdAt: timestamp, createdBy: 'مدير النظام' }];
  data.examEvaluations = [{ id: 'delete-evaluation', examId: 'delete-exam', employeeId: 'CP-0001', papers: 42, correctionErrors: null, behaviorErrors: null, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'مصطفى عمر كريم', updatedBy: 'مصطفى عمر كريم' }];
  return data;
}

async function enter(page: Page, data = deletionFixture(), account = 'SYSTEM') {
  await seedPopulatedPreview(page, data);
  await loginAccount(page, account);
}

async function fillConfirmation(dialog: Locator) {
  await dialog.getByLabel('سبب الحذف', { exact: true }).fill(reason);
  const typed = dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: true });
  if (await typed.count()) await typed.fill('حذف');
}

test.describe('Safe deletion workflows', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('workday cascade previews dependents and requires a fresh reason and typed confirmation after cancel', async ({ page }) => {
    const fixture = deletionFixture();
    const dayId = 'wd-2026-09-28';
    const expectedAttendance = fixture.attendance.filter(row => row.workdayId === dayId).length;
    await enter(page, fixture);
    await gotoPreview(page, `/attendance/${dayId}`);
    const trigger = page.getByRole('button', { name: /^حذف يوم / });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: /^حذف يوم / });
    const confirm = dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true });
    await expect(dialog).toContainText(`السجلات التي ستُحذف: ${expectedAttendance + 1}`);
    await expect(dialog).toContainText(`سجل حضور: ${expectedAttendance}`);
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('سبب الحذف', { exact: true }).fill('  خط  ');
    await dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: true }).fill('حذف');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('سبب الحذف', { exact: true }).fill(reason);
    await expect(confirm).toBeEnabled();
    await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
    expect((await readPreviewData(page)).workdays).toHaveLength(fixture.workdays.length);
    await trigger.click();
    await expect(dialog.getByLabel('سبب الحذف', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: true })).toHaveValue('');
    await fillConfirmation(dialog);
    await confirm.click();
    await expect(page).toHaveURL(/\/attendance$/);
    const after = await readPreviewData(page);
    expect(after.workdays.some(day => day.id === dayId)).toBe(false);
    expect(after.attendance.some(row => row.workdayId === dayId)).toBe(false);
    expect(after.attendance.length).toBe(fixture.attendance.length - expectedAttendance);
    expect(after.employees).toEqual(fixture.employees);
    expect(after.audit.slice(1)).toEqual(fixture.audit);
    expect(after.audit[0].newValues.reason).toBe(reason);
    await page.reload();
    expect((await readPreviewData(page)).workdays.some(day => day.id === dayId)).toBe(false);
  });

  test('linked departments and archived or paid attendance explain blockers without exposing confirmation fields', async ({ page }) => {
    const fixture = createPopulatedTestData();
    await enter(page, fixture);
    await gotoPreview(page, '/departments');
    await page.getByRole('button', { name: 'حذف التصحيح', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'حذف التصحيح؟', exact: true });
    await expect(dialog.getByRole('alert').first()).toContainText('القسم مرتبط');
    await expect(dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('سبب الحذف', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();

    for (const [dayId, blocker] of [['wd-2026-08-27', 'مؤرشفة أو معاد فتحها'], ['wd-2026-09-28', 'توجد عمليات صرف']]) {
      await gotoPreview(page, `/attendance/${dayId}`);
      await page.getByRole('button', { name: /^حذف يوم / }).click();
      dialog = page.getByRole('dialog', { name: /^حذف يوم / });
      await expect(dialog.getByRole('alert').filter({ hasText: blocker })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true })).toBeDisabled();
      await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
    }
    expect((await readPreviewData(page)).workdays).toEqual(fixture.workdays);
    expect((await readPreviewData(page)).audit).toEqual(fixture.audit);
  });

  test('employee cascade removes login credentials and overrides while preserving unrelated employees and audit', async ({ page }) => {
    const fixture = deletionFixture();
    fixture.workdays[0].overrides['CP-0001'] = 'INCLUDE';
    await enter(page, fixture);
    await gotoPreview(page, '/employees');
    await page.locator('.desktop-table').getByRole('button', { name: `حذف ${employeeName}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `حذف ${employeeName}؟`, exact: true });
    await expect(dialog).toContainText('سيُلغى حساب دخول الموظف');
    await expect(dialog).toContainText('أيام ستُزال منها استثناءات الموظف: 1');
    await fillConfirmation(dialog);
    // A failed credential write must keep the confirmation and its entered
    // reason, with business records untouched so the operator can retry.
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          Storage.prototype.setItem = original;
          throw new DOMException('Storage temporarily unavailable', 'QuotaExceededError');
        }
        return original.call(this, name, value);
      };
    }, AUTH_STORAGE_KEY);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Storage temporarily unavailable');
    await expect(dialog.getByLabel('سبب الحذف', { exact: true })).toHaveValue(reason);
    await expect(dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: true })).toHaveValue('حذف');
    expect((await readPreviewData(page)).employees).toEqual(fixture.employees);
    expect((await readPreviewData(page)).audit).toEqual(fixture.audit);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog).toBeHidden();
    const after = await readPreviewData(page);
    expect(after.employees).toEqual(fixture.employees.filter(person => person.id !== 'CP-0001'));
    for (const collection of ['attendance', 'deductions', 'bonuses', 'examEvaluations'] as const) {
      expect(after[collection].some(row => row.employeeId === 'CP-0001')).toBe(false);
    }
    expect(after.workdays.every(day => !Object.hasOwn(day.overrides, 'CP-0001'))).toBe(true);
    expect(after.audit.slice(1)).toEqual(fixture.audit);
    const auth = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), AUTH_STORAGE_KEY);
    expect(auth.employees['CP-0001']).toBeUndefined();
    expect(auth.employees['CP-0002']).toBeDefined();
    expect(auth.system).toBeDefined();
  });

  test('adjustment deletion requires reason and payment deletion separately unlocks payroll archive deletion', async ({ page }) => {
    await enter(page, createPopulatedTestData());
    await gotoPreview(page, '/deductions');
    await page.locator('.desktop-table').getByRole('button', { name: `حذف خصم ${employeeName}`, exact: true }).click();
    let dialog = page.getByRole('dialog', { name: `حذف خصم ${employeeName}؟`, exact: true });
    await expect(dialog.getByLabel('اكتب كلمة حذف للتأكيد', { exact: true })).toHaveCount(0);
    await fillConfirmation(dialog);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await readPreviewData(page)).deductions.some(row => row.id === 'ded-001')).toBe(false);
    await gotoPreview(page, '/payroll');
    await page.getByRole('button', { name: 'حذف أرشيف رواتب 2026-09', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'حذف أرشيف رواتب 2026-09؟', exact: true });
    await expect(dialog.getByRole('alert')).toContainText('احذف عمليات الصرف بتأكيد منفصل أولاً');
    await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await page.locator('.desktop-table').getByRole('button', { name: 'تفاصيل راتب مريم أحمد ناصر', exact: true }).click();
    const breakdown = page.getByRole('dialog', { name: 'مريم أحمد ناصر', exact: true });
    await breakdown.getByRole('button', { name: /^حذف صرف مريم أحمد ناصر بتاريخ/ }).click();
    dialog = page.getByRole('dialog', { name: /^حذف صرف مريم أحمد ناصر بتاريخ/ });
    await expect(dialog).toContainText('لا تلغي أي تحويل مالي فعلي');
    await fillConfirmation(dialog);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await readPreviewData(page)).payments.filter(row => row.month === '2026-09')).toHaveLength(0);
    await expect(breakdown).toContainText('لم يُصرف راتب هذا الشهر بعد');
    await breakdown.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await page.getByRole('button', { name: 'حذف أرشيف رواتب 2026-09', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'حذف أرشيف رواتب 2026-09؟', exact: true });
    await fillConfirmation(dialog);
    await expect(dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
  });

  test('auditor can clear a value without silently deleting and explicitly delete only after autosave settles', async ({ page }) => {
    await enter(page, deletionFixture(), 'CP-0004');
    await gotoPreview(page, '/employee/audit');
    await page.clock.pauseAt(new Date('2026-09-28T12:00:00.000Z'));
    const editor = page.getByRole('article', { name: `تدقيق ${employeeName}`, exact: true });
    await editor.getByRole('button', { name: 'حذف العدد 1: 42', exact: true }).click();
    const trigger = editor.getByRole('button', { name: `حذف تقييم ${employeeName}`, exact: true });
    await expect(trigger).toBeEnabled();
    expect((await readPreviewData(page)).examEvaluations.find(row => row.id === 'delete-evaluation')).toMatchObject({ papers: null });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: `حذف تقييم ${employeeName}؟`, exact: true });
    await fillConfirmation(dialog);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.clock.fastForward(2000);
    await expect(editor).toContainText('لم يُدخل بعد');
    expect((await readPreviewData(page)).examEvaluations).toHaveLength(0);
    await page.reload();
    await expect(editor).toContainText('لم يُدخل بعد');
  });

  test('closed exams and regular employee accounts do not expose auditor delete actions', async ({ page }) => {
    const fixture = deletionFixture();
    fixture.evaluationExams[0].state = 'CLOSED';
    fixture.evaluationExams[0].closedAt = '2026-09-28T09:00:00.000Z';
    fixture.evaluationExams[0].closedBy = 'مدير النظام';
    await enter(page, fixture, 'CP-0004');
    await gotoPreview(page, '/employee/audit');
    await expect(page.getByRole('article', { name: `تدقيق ${employeeName}`, exact: true }).getByLabel('إضافة أوراق مصححة', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^حذف/ })).toHaveCount(0);
    await loginAccount(page, 'CP-0002');
    await gotoPreview(page, '/employee/salary');
    await expect(page.getByRole('heading', { name: 'راتبي', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^حذف/ })).toHaveCount(0);
  });

  test('mobile season confirmation fits the viewport and deletes the full hierarchy with audit retained', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const fixture = deletionFixture();
    await enter(page, fixture);
    await gotoPreview(page, '/evaluations/seasons');
    await page.getByRole('button', { name: 'حذف موسم اختبار الحذف', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'حذف موسم اختبار الحذف؟', exact: true });
    await expect(dialog).toContainText('السجلات التي ستُحذف: 4');
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
    await fillConfirmation(dialog);
    await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'لا يوجد موسم مفتوح', exact: true })).toBeVisible();
    const after = await readPreviewData(page);
    for (const collection of ['evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const) expect(after[collection]).toHaveLength(0);
    expect(after.audit.slice(1)).toEqual(fixture.audit);
    expect(after.workdays).toEqual(fixture.workdays);
    expect(after.employees).toEqual(fixture.employees);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
