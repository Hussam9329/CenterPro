import type { Page } from '@playwright/test';
import { test, expect, gotoPreview, loginPreview, seedPopulatedPreview, readPreviewData } from './helpers/preview';
import { createPopulatedTestData } from '../fixtures/populated-data';

async function login(page: Page, role: 'المدير العام' | 'مدير العمليات' | 'موظف' = 'المدير العام') {
  await seedPopulatedPreview(page);
  await loginPreview(page, role);
}

async function reviewEmployee(page: Page, name: string) {
  const row = page.locator('.desktop-table tbody tr').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'مراجعة', exact: true }).click();
  return page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
}

test.describe('Attendance preview workflows', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('empty attendance guides prerequisites and legacy workdays redirects', async ({ page }) => {
    await loginPreview(page);
    await gotoPreview(page, '/workdays');
    await expect(page).toHaveURL(/\/attendance$/);
    await expect(page.getByRole('heading', { name: 'لا توجد أيام حضور حتى الآن.', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'إضافة قسم', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'أيام العمل', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'فتح يوم حضور جديد', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'فتح يوم حضور جديد', exact: true });
    await expect(dialog.getByRole('heading', { name: 'أضف قسماً أولاً', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'الأقسام', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'فتح يوم الحضور', exact: true })).toHaveCount(0);
    const data = await readPreviewData(page);
    expect(data.departments).toHaveLength(0);
    expect(data.employees).toHaveLength(0);
    expect(data.workdays).toHaveLength(0);
  });

  test('unified day lifecycle enforces one OPEN, overrides, review, and reopen protection', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await gotoPreview(page, '/workdays?open=new');
    await expect(page).toHaveURL(/\/attendance\?open=new$/);
    let dialog = page.getByRole('dialog', { name: 'فتح يوم حضور جديد', exact: true });
    await expect(dialog.getByRole('heading', { name: 'يوجد يوم حضور مفتوح حالياً.', exact: true })).toBeVisible();
    await expect(dialog).toContainText('يجب إغلاقه قبل فتح يوم حضور جديد.');
    await dialog.getByRole('link', { name: 'الذهاب إلى اليوم المفتوح', exact: true }).click();
    await expect(page).toHaveURL(/\/attendance\/wd-2026-09-28$/);
    await page.getByRole('button', { name: 'إغلاق اليوم', exact: true }).click();
    const closeDialog = page.getByRole('dialog', { name: 'إغلاق يوم الحضور' });
    await expect(closeDialog).toContainText('يوجد 2 موظفين');
    await expect(closeDialog.getByRole('button', { name: 'تأكيد إغلاق اليوم' })).toHaveCount(0);
    await closeDialog.getByRole('button', { name: 'مراجعة الحالات غير المحسومة', exact: true }).click();
    await expect(page.locator('.desktop-table tbody tr')).toHaveCount(2);
    for (const name of ['علي محمد حسن', 'حسين فاضل سالم']) {
      const review = await reviewEmployee(page, name);
      await review.getByLabel('الحالة الجديدة', { exact: true }).selectOption('PRESENT');
      await review.getByLabel('ملاحظة / سبب', { exact: true }).fill('إثبات الحضور بعد مراجعة الإدارة');
      await review.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
      await expect(review).toBeHidden();
    }
    await page.getByRole('button', { name: 'إغلاق اليوم', exact: true }).click();
    await closeDialog.getByRole('button', { name: 'تأكيد إغلاق اليوم', exact: true }).click();
    await expect(closeDialog).toBeHidden();
    expect((await readPreviewData(page)).workdays.filter(day => day.state === 'OPEN')).toHaveLength(0);
    await gotoPreview(page, '/attendance?open=new');
    dialog = page.getByRole('dialog', { name: 'فتح يوم حضور جديد', exact: true });
    await dialog.getByRole('checkbox', { name: 'التصحيح', exact: true }).check();
    await dialog.getByRole('button', { name: 'فتح يوم الحضور', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('يوجد يوم حضور بهذا التاريخ');
    await dialog.getByLabel('التاريخ', { exact: true }).fill('2026-09-29');
    await dialog.getByLabel('وقت بدء الدوام', { exact: true }).fill('15:00:00');
    await dialog.locator('summary').filter({ hasText: 'تخصيص مشاركة الموظفين' }).click();
    await dialog.getByLabel('مشاركة علي محمد حسن', { exact: true }).selectOption('EXCLUDE');
    await dialog.getByLabel('مشاركة حسين فاضل سالم', { exact: true }).selectOption('INCLUDE');
    await dialog.getByRole('button', { name: 'فتح يوم الحضور', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'حضور 29/09/2026', exact: true })).toBeVisible();
    await page.getByLabel('حالة الحضور', { exact: true }).selectOption('UNRESOLVED');
    await expect(page.locator('.desktop-table tbody tr')).toHaveCount(3);
    await page.getByLabel('حالة الحضور', { exact: true }).selectOption('EXEMPT');
    await expect(page.locator('.desktop-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.desktop-table tbody tr')).toContainText('علي محمد حسن');
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    await page.getByRole('button', { name: 'إعادة فتح اليوم', exact: true }).click();
    const reopen = page.getByRole('dialog', { name: 'إعادة فتح يوم الحضور', exact: true });
    await expect(reopen).toContainText('أغلق اليوم المفتوح قبل إعادة فتح يوم آخر.');
    await expect(reopen.getByRole('button', { name: 'إعادة فتح اليوم', exact: true })).toHaveCount(0);
    const data = await readPreviewData(page);
    expect(data.workdays.filter(day => day.state === 'OPEN')).toHaveLength(1);
    expect(data.workdays.find(day => day.state === 'OPEN')?.date).toBe('2026-09-29');
  });

  test('quick dropdown saves a manual present status and routes absence through the review dialog', async ({ page }) => {
    await login(page);
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    const row = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' });
    const status = row.getByRole('combobox', { name: 'تغيير حالة علي محمد حسن' });
    await expect(status).toHaveValue('UNRESOLVED');
    await status.selectOption('PRESENT');
    await expect(status).toHaveValue('PRESENT');
    await expect(row).toContainText('تسجيل سريع بوقت بدء الدوام');
    let data = await readPreviewData(page);
    const first = data.attendance.find(record => record.workdayId === 'wd-2026-09-28' && record.employeeId === 'CP-0001')!;
    expect(first).toMatchObject({ status: 'PRESENT', source: 'MANUAL', latenessSeconds: 0 });
    expect(first.checkIn).toBe('2026-09-28T11:00:00.000Z');
    await status.selectOption('EXCUSED');
    const dialog = page.getByRole('dialog', { name: 'مراجعة سجل الحضور' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'غياب بعذر' })).toBeChecked();
    // Selecting absence alone must never persist before its review is saved.
    data = await readPreviewData(page);
    expect(data.attendance.find(item => item.id === first.id)?.status).toBe('PRESENT');
    await dialog.getByLabel('ملاحظة / سبب', { exact: false }).fill('عذر طبي موثق');
    await dialog.getByRole('button', { name: 'حفظ التعديل' }).click();
    await expect(dialog).toBeHidden();
    await expect(status).toHaveValue('EXCUSED');
    expect((await readPreviewData(page)).attendance.find(item => item.id === first.id)).toMatchObject({ status: 'EXCUSED', checkIn: null, reason: 'عذر طبي موثق' });
    await status.selectOption('UNRESOLVED');
    await expect(status).toHaveValue('UNRESOLVED');
    await status.selectOption('PRESENT');
    await expect(status).toHaveValue('PRESENT');
    await status.selectOption('UNRESOLVED');
    const confirm = page.getByRole('dialog', { name: 'إزالة تسجيل الحضور؟' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'إلغاء' }).click();
    await page.getByRole('dialog', { name: 'مراجعة سجل الحضور' }).getByRole('button', { name: 'إلغاء' }).click();
    await expect(status).toHaveValue('PRESENT');
    expect((await readPreviewData(page)).attendance.find(item => item.id === first.id)?.status).toBe('PRESENT');
    await status.selectOption('UNRESOLVED');
    await confirm.getByRole('button', { name: 'إزالة الحضور', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(status).toHaveValue('UNRESOLVED');
    data = await readPreviewData(page);
    expect(data.attendance.find(item => item.id === first.id)).toMatchObject({ status: 'UNRESOLVED', checkIn: null, source: null, latenessSeconds: 0 });
    expect(data.audit[0]).toMatchObject({ action: 'إزالة تسجيل حضور', employeeId: 'CP-0001', oldValues: { status: 'PRESENT' }, newValues: { status: 'UNRESOLVED' } });
  });

  test('quick absence selections remain unsaved until reviewed, and exemption saves directly and updates participation', async ({ page }) => {
    await login(page);
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    const status = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' }).getByRole('combobox', { name: 'تغيير حالة علي محمد حسن' });
    const before = await readPreviewData(page);
    const review = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
    for (const target of ['EXCUSED', 'UNEXCUSED']) {
      await status.selectOption(target);
      await expect(review).toBeVisible();
      await expect(review.getByRole('radio', { name: target === 'EXCUSED' ? 'غياب بعذر' : 'غياب بدون عذر', exact: true })).toBeChecked();
      await review.getByLabel('ملاحظة / سبب', { exact: true }).fill('ملاحظة لم يتم حفظها');
      await review.getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expect(status).toHaveValue('UNRESOLVED');
      const afterCancel = await readPreviewData(page);
      expect(afterCancel.attendance).toEqual(before.attendance);
      expect(afterCancel.workdays).toEqual(before.workdays);
      expect(afterCancel.audit).toEqual(before.audit);
    }
    // Exemption is a plain status: it saves at once without asking for a reason.
    await status.selectOption('EXEMPT');
    await expect(page.getByText('تم تحديث حالة الحضور.')).toBeVisible();
    await expect(review).toBeHidden();
    await expect(status).toHaveValue('EXEMPT');
    expect((await readPreviewData(page)).workdays.find(day => day.id === 'wd-2026-09-28')?.overrides['CP-0001']).toBe('EXCLUDE');
    await status.selectOption('UNRESOLVED');
    await expect(status).toHaveValue('UNRESOLVED');
    expect((await readPreviewData(page)).workdays.find(day => day.id === 'wd-2026-09-28')?.overrides['CP-0001']).toBe('INCLUDE');
  });

  test('new day defaults to 3 PM and changing date or time does not request an edit reason', async ({ page }) => {
    const fixture = createPopulatedTestData();
    fixture.workdays = [];
    fixture.attendance = [];
    await seedPopulatedPreview(page, fixture);
    await loginPreview(page);
    await gotoPreview(page, '/attendance?open=new');
    const dialog = page.getByRole('dialog', { name: 'فتح يوم حضور جديد' });
    await expect(dialog.getByLabel('وقت بدء الدوام')).toHaveValue('15:00:00');
    await expect(dialog.getByLabel('سبب التعديل')).toHaveCount(0);
    await dialog.getByLabel('التاريخ').fill('2026-09-24');
    await dialog.getByLabel('وقت بدء الدوام').fill('15:20:00');
    await expect(dialog.getByLabel('سبب التعديل')).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'التصحيح' }).check();
    await dialog.getByRole('button', { name: 'فتح يوم الحضور' }).click();
    await expect(dialog).toBeHidden();
    expect((await readPreviewData(page)).workdays[0]).toMatchObject({ date: '2026-09-24', startTime: '15:20:00' });
    await page.getByRole('button', { name: 'تعديل اليوم' }).click();
    const edit = page.getByRole('dialog', { name: 'تعديل يوم الحضور' });
    await expect(edit.getByLabel('سبب التعديل')).toHaveCount(0);
    await expect(edit.getByRole('button', { name: 'حفظ التعديل', exact: true })).toBeDisabled();
    await edit.getByLabel('وقت بدء الدوام').fill('15:30:00');
    await expect(edit.getByLabel('سبب التعديل')).toBeVisible();
    await expect(edit.getByLabel('سبب التعديل')).toHaveAttribute('required', '');
    await edit.getByLabel('وقت بدء الدوام').fill('15:20:00');
    await expect(edit.getByLabel('سبب التعديل')).toHaveCount(0);
    await expect(edit.getByRole('button', { name: 'حفظ التعديل', exact: true })).toBeDisabled();
  });

  test('records manual seconds, keeps absence choices exclusive and creates audit details', async ({ page }) => {
    await login(page);
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    let dialog = await reviewEmployee(page, 'علي محمد حسن');
    await dialog.getByLabel('الحالة الجديدة', { exact: true }).selectOption('PRESENT');
    await dialog.getByLabel('وقت الحضور', { exact: false }).fill('14:00:01');
    await expect(dialog.getByLabel('ملاحظة / سبب', { exact: false })).not.toHaveAttribute('required', '');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeHidden();
    let row = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' });
    await expect(row).toContainText('02:00:01 PM');
    await expect(row).toContainText('1 ثانية');
    await expect(row).toContainText('يدوي');
    expect((await readPreviewData(page)).audit[0].newValues.reason).toBe('');
    dialog = await reviewEmployee(page, 'علي محمد حسن');
    await dialog.getByRole('checkbox', { name: 'غائب', exact: true }).check();
    await expect(dialog.getByRole('radio', { name: 'غياب بعذر', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: 'غياب بدون عذر', exact: true }).check();
    await expect(dialog.getByRole('radio', { name: 'غياب بعذر', exact: true })).not.toBeChecked();
    await dialog.getByLabel('ملاحظة / سبب', { exact: false }).fill('تصحيح الحالة بعد مراجعة الإدارة');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeHidden();
    row = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' });
    await expect(row).toContainText('غياب بدون عذر');
    await expect(row).not.toContainText('02:00:01 PM');
    const audit = (await readPreviewData(page)).audit[0];
    expect(audit.action).toBe('تعديل حالة الحضور');
    expect(audit.employeeId).toBe('CP-0001');
    expect(audit.newValues.reason).toBe('تصحيح الحالة بعد مراجعة الإدارة');
    expect(audit.oldValues.status).toBe('PRESENT');
  });

  test('closed day settings require a reason and update lateness in the same context', async ({ page }) => {
    await login(page);
    await gotoPreview(page, '/attendance/wd-2026-09-27');
    await page.getByRole('button', { name: 'تعديل اليوم', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'تعديل يوم الحضور', exact: true });
    await dialog.getByLabel('وقت بدء الدوام', { exact: true }).fill('13:00:00');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect((await readPreviewData(page)).workdays.find(day => day.id === 'wd-2026-09-27')?.startTime).toBe('14:00:00');
    await dialog.getByLabel('سبب التعديل', { exact: true }).fill('تصحيح وقت بدء الدوام بعد مراجعة السجل');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/attendance\/wd-2026-09-27$/);
    const data = await readPreviewData(page);
    expect(data.workdays.find(day => day.id === 'wd-2026-09-27')).toMatchObject({ state: 'CLOSED', startTime: '13:00:00' });
    expect(data.attendance.find(record => record.workdayId === 'wd-2026-09-27' && record.employeeId === 'CP-0002')).toMatchObject({ status: 'PRESENT', latenessSeconds: 3287 });
    expect(data.attendance.find(record => record.workdayId === 'wd-2026-09-27' && record.employeeId === 'CP-0001')).toMatchObject({ status: 'EXCUSED', latenessSeconds: 0 });
    expect(data.audit[0].newValues.reason).toBe('تصحيح وقت بدء الدوام بعد مراجعة السجل');
  });

  test('allows an optional note and still requires explicit confirmation when removing attendance', async ({ page }) => {
    await login(page);
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    const dialog = await reviewEmployee(page, 'مريم أحمد ناصر');
    await expect(dialog.getByLabel('ملاحظة / سبب', { exact: false })).toBeVisible();
    await dialog.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'إزالة تسجيل الحضور؟', exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
    await confirm.getByRole('button', { name: 'إزالة الحضور', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.desktop-table tbody tr').filter({ hasText: 'مريم أحمد ناصر' })).toContainText('غير محسوم');
  });

  for (const width of [360, 390]) {
    test(`quick status works within mobile cards in both themes at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const fixture = createPopulatedTestData();
      const name = 'علي محمد حسن عبد الرحمن عبد الكريم';
      fixture.employees.find(employee => employee.id === 'CP-0001')!.name = name;
      await seedPopulatedPreview(page, fixture);
      await loginPreview(page);
      await gotoPreview(page, '/attendance/wd-2026-09-28');
      const card = page.locator('.mobile-cards article').filter({ hasText: name });
      const status = card.getByRole('combobox', { name: `تغيير حالة ${name}` });
      await expect(status).toBeVisible();
      await expect(card.getByRole('button', { name: 'مراجعة الحالة' })).toBeVisible();
      await status.selectOption('PRESENT');
      await expect(status).toHaveValue('PRESENT');
      expect((await readPreviewData(page)).attendance.find(record => record.employeeId === 'CP-0001' && record.workdayId === 'wd-2026-09-28')).toMatchObject({ status: 'PRESENT', checkIn: '2026-09-28T11:00:00.000Z', reason: 'تسجيل سريع بوقت بدء الدوام' });
      await status.selectOption('UNEXCUSED');
      const review = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
      await expect(review.getByRole('radio', { name: 'غياب بدون عذر', exact: true })).toBeChecked();
      await review.getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expect(status).toHaveValue('PRESENT');
      for (const theme of ['light', 'dark']) {
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        expect(await status.evaluate(element => {
          const cardBounds = element.closest('article')!.getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return bounds.left >= cardBounds.left - 1 && bounds.right <= cardBounds.right + 1;
        })).toBe(true);
        await card.screenshot({ path: testInfo.outputPath(`quick-attendance-${width}-${theme}.png`) });
        if (theme === 'light') await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
      }
    });
  }

  test('archived attendance is read-only for operations admin', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await gotoPreview(page, '/attendance/wd-2026-08-27');
    await expect(page.getByText('هذا الشهر مؤرشف وسجلاته للقراءة فقط.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تعديل اليوم', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'إعادة فتح اليوم', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: /^تغيير حالة / })).toHaveCount(0);
    await page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' }).getByRole('button', { name: 'التفاصيل', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
    await expect(dialog).toContainText('هذا السجل محمي');
    await expect(dialog.getByRole('button', { name: 'حفظ التعديل', exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('ملاحظة / سبب')).toHaveCount(0);
  });

  test('reopened attendance waits for explicit payroll recalculation without replacing history', async ({ page }) => {
    const fixture = createPopulatedTestData();
    // A later department rate must not replace an archived month's own rules.
    fixture.departments.find(department => department.id === 'dept-correction')!.salary.dailyRate = 30000;
    await seedPopulatedPreview(page, fixture);
    await loginPreview(page);
    const before = await readPreviewData(page);
    const archived = before.months.find(month => month.month === '2026-08')!;
    await gotoPreview(page, '/payroll');
    await page.getByLabel('شهر الرواتب', { exact: true }).fill('2026-08');
    await page.getByRole('button', { name: 'إعادة فتح للتعديل', exact: true }).click();
    const reopening = page.getByRole('dialog', { name: 'إعادة فتح الشهر للتعديل', exact: true });
    await reopening.getByLabel('للتأكيد، اكتب 2026-08', { exact: true }).fill('2026-08');
    await reopening.getByRole('button', { name: 'تأكيد إعادة الفتح', exact: true }).click();
    await expect(reopening).toBeHidden();

    await gotoPreview(page, '/attendance/wd-2026-08-27');
    const review = await reviewEmployee(page, 'علي محمد حسن');
    await review.getByRole('checkbox', { name: 'غائب', exact: true }).check();
    await review.getByLabel('ملاحظة / سبب', { exact: true }).fill('تثبيت عذر موثق بعد مراجعة الحضور التاريخي');
    await expect(review).toContainText('يتطلب إعادة الاحتساب الصريحة');
    await review.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(review).toBeHidden();
    let pending = await readPreviewData(page);
    let pendingMonth = pending.months.find(month => month.month === '2026-08')!;
    expect(pendingMonth.snapshots).toEqual(archived.snapshots);
    expect(pendingMonth.sourceSnapshot).toEqual(archived.sourceSnapshot);
    expect(pending.attendance.find(record => record.workdayId === 'wd-2026-08-27' && record.employeeId === 'CP-0001')?.status).toBe('EXCUSED');

    await page.getByRole('button', { name: 'تعديل اليوم', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'تعديل يوم الحضور', exact: true });
    await settings.getByLabel('وقت بدء الدوام', { exact: true }).fill('13:00:00');
    await settings.getByLabel('سبب التعديل', { exact: true }).fill('تصحيح موعد بداية اليوم في السجل التاريخي');
    await settings.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(settings).toBeHidden();
    pending = await readPreviewData(page);
    pendingMonth = pending.months.find(month => month.month === '2026-08')!;
    expect(pendingMonth.snapshots).toEqual(archived.snapshots);
    expect(pendingMonth.sourceSnapshot).toEqual(archived.sourceSnapshot);
    expect(pending.payments).toEqual(before.payments);

    await gotoPreview(page, '/payroll');
    await page.getByLabel('شهر الرواتب', { exact: true }).fill('2026-08');
    await expect(page.getByText('توجد تعديلات على السجلات تنتظر إعادة الاحتساب.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إعادة الاحتساب بالقواعد المؤرشفة', exact: true }).click();
    const recalculation = page.getByRole('dialog', { name: 'إعادة احتساب الشهر المؤرشف', exact: true });
    await recalculation.getByLabel('للتأكيد، اكتب 2026-08', { exact: true }).fill('2026-08');
    await recalculation.getByRole('button', { name: 'تأكيد إعادة الاحتساب', exact: true }).click();
    await expect(recalculation).toBeHidden();
    const after = await readPreviewData(page);
    const recalculated = after.months.find(month => month.month === '2026-08')!;
    const result = recalculated.snapshots['CP-0001'];
    expect(result.attendanceDays).toBe(archived.snapshots['CP-0001'].attendanceDays - 1);
    expect(result.excusedDays).toBe(archived.snapshots['CP-0001'].excusedDays + 1);
    expect(result.finalSalary).toBeLessThan(archived.snapshots['CP-0001'].finalSalary);
    expect(result.salaryConfig).toEqual(archived.snapshots['CP-0001'].salaryConfig);
    expect(result.salaryConfig.dailyRate).toBe(25000);
    expect(result.paymentStatus).toBe('REVIEW');
    expect(recalculated.sourceSnapshot?.attendance.find(record => record.workdayId === 'wd-2026-08-27' && record.employeeId === 'CP-0001')?.status).toBe('EXCUSED');
    expect(recalculated.sourceSnapshot?.workdays.find(day => day.id === 'wd-2026-08-27')?.startTime).toBe('13:00:00');
    expect(recalculated.sourceSnapshot?.departments).toEqual(archived.sourceSnapshot?.departments);
    expect(recalculated.sourceSnapshot?.employees).toEqual(archived.sourceSnapshot?.employees);
    expect(recalculated.snapshots['CP-0002'].latenessSeconds).toBeGreaterThan(archived.snapshots['CP-0002'].latenessSeconds);
    expect(after.payments).toEqual(before.payments);
    await expect(page.getByText('توجد تعديلات على السجلات تنتظر إعادة الاحتساب.', { exact: true })).toHaveCount(0);
  });

  test('employee mock scan updates own record once and handles failure outcomes', async ({ page }) => {
    await login(page, 'موظف');
    await gotoPreview(page, '/employee/scan');
    await expect(page.getByText('الكاميرا تقرأ الرمز فعلياً؛ النتيجة محاكاة محلية', { exact: false })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'تجربة حالات الواجهة' }).click();
    await page.getByLabel('حالة التجربة', { exact: true }).selectOption('EXPIRED');
    await page.getByRole('button', { name: 'تجربة الحالة', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'انتهت صلاحية رمز QR', exact: true })).toBeVisible();
    await page.getByLabel('حالة التجربة', { exact: true }).selectOption('NETWORK');
    await page.getByRole('button', { name: 'تجربة الحالة', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'تعذر الاتصال', exact: true })).toBeVisible();
    await page.getByLabel('حالة التجربة', { exact: true }).selectOption('SUCCESS');
    await page.getByRole('button', { name: 'تجربة الحالة', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'تم تسجيل حضورك التجريبي', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'تجربة الحالة', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'تم تسجيل حضورك مسبقاً اليوم', exact: true })).toBeVisible();
    const records = (await readPreviewData(page)).attendance.filter(record => record.workdayId === 'wd-2026-09-28' && record.employeeId === 'CP-0001');
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('PRESENT');
    expect(records[0].source).toBe('QR');
    await gotoPreview(page, '/attendance');
    await expect(page).toHaveURL(/\/employee$/);
  });

  test('attendance display generates a rotating preview QR without sidebar', async ({ page }) => {
    const fixture = createPopulatedTestData();
    fixture.workdays.forEach(day => { day.state = day.date === '2026-09-27' ? 'OPEN' : 'CLOSED'; });
    await seedPopulatedPreview(page, fixture);
    await loginPreview(page);
    await gotoPreview(page, '/attendance-display');
    await expect(page.getByText('27/09/2026', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور', exact: true })).toBeVisible();
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
    const qr = page.locator('svg').filter({ has: page.locator('title', { hasText: 'رمز تسجيل حضور تجريبي' }) });
    await expect(qr).toBeVisible();
    const firstPattern = await qr.locator('path').last().getAttribute('d');
    // Advance the browser's clock rather than waiting a real 45 seconds.
    await page.clock.fastForward(46_000);
    await expect.poll(() => qr.locator('path').last().getAttribute('d')).not.toBe(firstPattern);
    await expect(page.getByText('رمز معاينة يتجدد تلقائياً.', { exact: false })).toBeVisible();
  });
});
