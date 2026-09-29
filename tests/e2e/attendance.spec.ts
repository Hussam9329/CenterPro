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

  test('archived attendance is read-only for operations admin', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await gotoPreview(page, '/attendance/wd-2026-08-27');
    await expect(page.getByText('هذا الشهر مؤرشف وسجلاته للقراءة فقط.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تعديل اليوم', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'إعادة فتح اليوم', exact: true })).toBeDisabled();
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
