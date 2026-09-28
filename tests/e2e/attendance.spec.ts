import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, role: 'المدير العام' | 'مدير العمليات' | 'موظف' = 'المدير العام') {
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await expect(page).toHaveURL(role === 'موظف' ? /\/employee$/ : /\/dashboard$/);
  await expect(page.locator('.brand-intro')).toBeHidden();
}

async function reviewEmployee(page: Page, name: string) {
  const row = page.locator('.desktop-table tbody tr').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'مراجعة', exact: true }).click();
  return page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
}

test.describe('Attendance preview workflows', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('opens one workday per date, applies employee overrides and blocks unresolved close', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await page.goto('/workdays?open=new');
    const dialog = page.getByRole('dialog', { name: 'فتح يوم حضور', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: 'التصحيح', exact: true }).check();
    await dialog.getByRole('button', { name: 'فتح يوم الحضور', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('يوجد يوم حضور');
    await dialog.getByLabel('التاريخ', { exact: false }).fill('2026-09-29');
    await dialog.getByLabel('وقت بدء الدوام', { exact: false }).fill('15:00:00');
    await dialog.locator('summary').filter({ hasText: 'تخصيص مشاركة الموظفين' }).click();
    await dialog.getByLabel('مشاركة علي محمد حسن', { exact: true }).selectOption('EXCLUDE');
    await dialog.getByLabel('مشاركة حسين فاضل سالم', { exact: true }).selectOption('INCLUDE');
    await dialog.getByRole('button', { name: 'فتح يوم الحضور', exact: true }).click();
    await expect(dialog).toBeHidden();
    const workday = page.locator('article').filter({ hasText: '29/09/2026' });
    await expect(workday).toHaveCount(1);
    await expect(workday).toContainText('3 غير محسوم');
    await workday.getByRole('button', { name: 'إغلاق اليوم', exact: true }).click();
    const closeDialog = page.getByRole('dialog', { name: 'إغلاق يوم الحضور' });
    await expect(closeDialog).toContainText('باقي 3 موظفين');
    await expect(closeDialog.getByRole('button', { name: 'تأكيد إغلاق اليوم' })).toHaveCount(0);
    await closeDialog.getByRole('link', { name: 'مراجعة الحالات غير المحسومة' }).click();
    await expect(page).toHaveURL(/date=2026-09-29&status=UNRESOLVED/);
    await expect(page.locator('.desktop-table tbody tr')).toHaveCount(3);
    await page.getByLabel('حالة الحضور', { exact: true }).selectOption('EXEMPT');
    await expect(page.locator('.desktop-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.desktop-table tbody tr')).toContainText('علي محمد حسن');
  });

  test('records manual seconds, keeps absence choices exclusive and creates audit details', async ({ page }) => {
    await login(page);
    await page.goto('/attendance?date=2026-09-28');
    let dialog = await reviewEmployee(page, 'علي محمد حسن');
    await dialog.getByLabel('الحالة الجديدة', { exact: true }).selectOption('PRESENT');
    await dialog.getByLabel('وقت الحضور', { exact: false }).fill('14:00:01');
    await dialog.getByLabel('سبب التعديل', { exact: false }).fill('مراجعة وقت الدخول بالثواني');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeHidden();
    let row = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' });
    await expect(row).toContainText('02:00:01 PM');
    await expect(row).toContainText('1 ثانية');
    await expect(row).toContainText('يدوي');
    dialog = await reviewEmployee(page, 'علي محمد حسن');
    await dialog.getByRole('checkbox', { name: 'غائب', exact: true }).check();
    await expect(dialog.getByRole('radio', { name: 'غياب بعذر', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: 'غياب بدون عذر', exact: true }).check();
    await expect(dialog.getByRole('radio', { name: 'غياب بعذر', exact: true })).not.toBeChecked();
    await dialog.getByLabel('سبب التعديل', { exact: false }).fill('تصحيح الحالة بعد مراجعة الإدارة');
    await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
    await expect(dialog).toBeHidden();
    row = page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' });
    await expect(row).toContainText('غياب بدون عذر');
    await expect(row).not.toContainText('02:00:01 PM');
    const audit = await page.evaluate(() => {
      const state = JSON.parse(sessionStorage.getItem('centerpro-ui-preview-v1') || '{}');
      return state.data.audit[0];
    });
    expect(audit.action).toBe('تعديل حالة الحضور');
    expect(audit.employeeId).toBe('CP-0001');
    expect(audit.newValues.reason).toBe('تصحيح الحالة بعد مراجعة الإدارة');
    expect(audit.oldValues.status).toBe('PRESENT');
  });

  test('requires reason and explicit confirmation when removing attendance', async ({ page }) => {
    await login(page);
    await page.goto('/attendance?date=2026-09-28');
    const dialog = await reviewEmployee(page, 'مريم أحمد ناصر');
    await dialog.getByRole('button', { name: 'إزالة تسجيل الحضور', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('اكتب سبب إزالة الحضور');
    await dialog.getByLabel('سبب التعديل', { exact: false }).fill('إلغاء إدخال يدوي غير صحيح');
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
    await page.goto('/attendance?date=2026-08-27');
    await expect(page.getByText('هذا الشهر مؤرشف وسجلاته للقراءة فقط.', { exact: false })).toBeVisible();
    await page.locator('.desktop-table tbody tr').filter({ hasText: 'علي محمد حسن' }).getByRole('button', { name: 'التفاصيل', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'مراجعة سجل الحضور', exact: true });
    await expect(dialog).toContainText('هذا السجل محمي');
    await expect(dialog.getByRole('button', { name: 'حفظ التعديل', exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel('سبب التعديل')).toHaveCount(0);
  });

  test('employee mock scan updates own record once and handles failure outcomes', async ({ page }) => {
    await login(page, 'موظف');
    await page.goto('/employee/scan');
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
    const records = await page.evaluate(() => {
      const state = JSON.parse(sessionStorage.getItem('centerpro-ui-preview-v1') || '{}');
      return state.data.attendance.filter((record: { workdayId: string; employeeId: string }) => record.workdayId === 'wd-2026-09-28' && record.employeeId === state.session.employeeId);
    });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('PRESENT');
    expect(records[0].source).toBe('QR');
    await page.goto('/attendance');
    await expect(page).toHaveURL(/\/employee$/);
  });

  test('attendance display generates a rotating preview QR without sidebar', async ({ page }) => {
    await login(page);
    await page.clock.install();
    await page.goto('/attendance-display');
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
