import type { Page } from '@playwright/test';
import { test, expect, loginPreview as login, gotoPreview as goto, seedPopulatedPreview, readPreviewData as data } from './helpers/preview';
import ExcelJS from 'exceljs';

async function payrollDetail(page: Page, employeeName: string) {
  await page.locator('.desktop-table tbody tr').filter({ hasText: employeeName }).getByRole('button', { name: `تفاصيل راتب ${employeeName}`, exact: true }).click();
  return page.getByRole('dialog', { name: employeeName, exact: true });
}

async function addBonus(page: Page, amount: number, month = '2026-09', employeeId = 'CP-0002') {
  await goto(page, '/bonuses');
  if (month !== '2026-09') await page.getByLabel('الشهر', { exact: true }).fill(month);
  await page.getByRole('button', { name: 'إضافة مكافأة', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'إضافة مكافأة', exact: true });
  await dialog.getByLabel('الموظف', { exact: false }).selectOption(employeeId);
  await dialog.getByLabel('المبلغ (د.ع)', { exact: false }).fill(String(amount));
  await dialog.getByLabel('التاريخ', { exact: false }).fill(`${month}-15`);
  await dialog.getByLabel('سبب مكافأة', { exact: false }).fill('مكافأة مراجعة موثقة لاختبار ترابط الراتب');
  await dialog.getByRole('button', { name: 'حفظ مكافأة', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Finance preview workflows', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page); });

  test('dashboard quick links open forms and route attendance to the existing open day', async ({ page }) => {
    await login(page);
    const shortcuts = [
      { link: 'إضافة خصم', url: /\/deductions\?add=1$/, dialog: 'إضافة خصم' },
      { link: 'إضافة مكافأة', url: /\/bonuses\?add=1$/, dialog: 'إضافة مكافأة' },
      { link: 'إضافة موظف', url: /\/employees\?add=1$/, dialog: 'إضافة موظف جديد' },
    ];
    for (const shortcut of shortcuts) {
      await page.locator('.quick-actions').getByRole('link', { name: shortcut.link, exact: true }).click();
      await expect(page).toHaveURL(shortcut.url);
      const dialog = page.getByRole('dialog', { name: shortcut.dialog, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
      await page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true }).getByRole('link', { name: 'الرئيسية', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    await page.locator('.quick-actions').getByRole('link', { name: 'فتح يوم حضور', exact: true }).click();
    await expect(page).toHaveURL(/\/attendance\?open=new$/);
    await expect(page.getByText('يوجد يوم حضور مفتوح حالياً.', { exact: false }).first()).toBeVisible();
    await page.getByRole('link', { name: 'الذهاب إلى اليوم المفتوح', exact: true }).first().click();
    await expect(page).toHaveURL(/\/attendance\/wd-2026-09-28$/);
  });

  test('shows payment differences, updates open salary after bonus and keeps payment history', async ({ page }) => {
    await login(page);
    await goto(page, '/payroll');
    await expect(page.getByLabel('نوع الراتب', { exact: true })).toHaveText('جميع الأنواعغير قطعيقطعي');
    let dialog = await payrollDetail(page, 'مريم أحمد ناصر');
    await expect(dialog.getByText('غير قطعي', { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(/شرائح|شريحة/);
    await expect(dialog).toContainText('تغيّر الراتب بعد الصرف');
    await expect(dialog).toContainText('650,000 د.ع');
    await expect(dialog).toContainText('625,000 د.ع');
    await expect(dialog).toContainText('-25,000 د.ع');
    const originalPayments = (await data(page)).payments;
    await dialog.getByRole('button', { name: 'إغلاق النافذة' }).click();
    await addBonus(page, 20000);
    const afterBonus = await data(page);
    expect(afterBonus.audit[0].action).toBe('إضافة مكافأة');
    expect(afterBonus.audit[0].employeeId).toBe('CP-0002');
    expect(afterBonus.audit[0].newValues.amount).toBe(20000);
    expect(afterBonus.payments).toEqual(originalPayments);
    await goto(page, '/payroll');
    dialog = await payrollDetail(page, 'مريم أحمد ناصر');
    await expect(dialog).toContainText('645,000 د.ع');
    await expect(dialog).toContainText('-5,000 د.ع');
    await expect(dialog).toContainText('مكافأة مراجعة موثقة لاختبار ترابط الراتب');
    await dialog.getByRole('button', { name: 'تسجيل عملية صرف جديدة', exact: true }).click();
    const payment = page.getByRole('dialog', { name: 'تسجيل صرف الراتب', exact: true });
    await expect(payment).toContainText('العملية السابقة تبقى محفوظة');
    await payment.getByLabel('المبلغ المصروف (د.ع)', { exact: false }).fill('645000');
    await payment.getByLabel('تاريخ الصرف', { exact: false }).fill('2026-09-29');
    await payment.getByRole('button', { name: 'تأكيد تسجيل الصرف' }).click();
    await expect(payment).toBeHidden();
    const paid = await data(page);
    const history = paid.payments.filter(item => item.employeeId === 'CP-0002' && item.month === '2026-09');
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ amount: 650000, salaryAtPayment: 650000 });
    expect(history[1]).toMatchObject({ amount: 645000, salaryAtPayment: 645000 });
    await expect(dialog).not.toContainText('تغيّر الراتب بعد الصرف');
  });

  test('blocks unresolved archive and keeps historical rules through explicit reopen and recalculation', async ({ page }) => {
    await login(page);
    await goto(page, '/payroll');
    await page.getByRole('button', { name: 'إغلاق وأرشفة الشهر', exact: true }).click();
    let confirmation = page.getByRole('dialog', { name: 'إغلاق وأرشفة رواتب الشهر', exact: true });
    await expect(confirmation).toContainText('لا يمكن الأرشفة');
    await expect(confirmation.getByRole('button', { name: 'تأكيد الأرشفة', exact: true })).toBeDisabled();
    await confirmation.getByRole('button', { name: 'إلغاء', exact: true }).click();
    const archived = (await data(page)).months.find(item => item.month === '2026-08')!;
    const originalSalary = archived.snapshots['CP-0001'].finalSalary;
    await goto(page, '/departments');
    await page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'التصحيح', exact: true }) }).getByRole('button', { name: 'إعدادات القسم', exact: true }).click();
    const departmentDialog = page.getByRole('dialog').first();
    await departmentDialog.getByLabel('قيمة اليومية', { exact: false }).fill('30000');
    await departmentDialog.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    await page.getByRole('dialog', { name: 'تأكيد تعديل قوانين القسم', exact: true }).getByRole('button', { name: 'حفظ وإعادة الاحتساب' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const afterSettings = (await data(page)).months.find(item => item.month === '2026-08')!;
    expect(afterSettings).toEqual(archived);
    await goto(page, '/payroll');
    await page.getByLabel('شهر الرواتب', { exact: true }).fill('2026-08');
    await page.getByRole('button', { name: 'إعادة فتح للتعديل', exact: true }).click();
    confirmation = page.getByRole('dialog', { name: 'إعادة فتح الشهر للتعديل', exact: true });
    await expect(confirmation.getByRole('button', { name: 'تأكيد إعادة الفتح', exact: true })).toBeDisabled();
    await confirmation.getByLabel('للتأكيد، اكتب 2026-08', { exact: false }).fill('2026-08');
    await confirmation.getByRole('button', { name: 'تأكيد إعادة الفتح', exact: true }).click();
    await expect(page.getByText('هذا الشهر مؤرشف سابقاً وتمت إعادة فتحه للتعديل.', { exact: true })).toBeVisible();
    const reopened = (await data(page)).months.find(item => item.month === '2026-08')!;
    expect(reopened.state).toBe('REOPENED');
    expect(reopened.snapshots).toEqual(archived.snapshots);
    await addBonus(page, 10000, '2026-08', 'CP-0001');
    expect((await data(page)).months.find(item => item.month === '2026-08')!.snapshots['CP-0001'].finalSalary).toBe(originalSalary);
    await goto(page, '/payroll');
    await page.getByLabel('شهر الرواتب', { exact: true }).fill('2026-08');
    await expect(page.getByText('توجد تعديلات على السجلات تنتظر إعادة الاحتساب.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إعادة الاحتساب بالقواعد المؤرشفة', exact: true }).click();
    confirmation = page.getByRole('dialog', { name: 'إعادة احتساب الشهر المؤرشف', exact: true });
    await confirmation.getByLabel('للتأكيد، اكتب 2026-08', { exact: false }).fill('2026-08');
    await confirmation.getByRole('button', { name: 'تأكيد إعادة الاحتساب', exact: true }).click();
    await expect(confirmation).toBeHidden();
    const recalculated = (await data(page)).months.find(item => item.month === '2026-08')!;
    expect(recalculated.snapshots['CP-0001'].finalSalary).toBe(originalSalary + 10000);
    expect(recalculated.snapshots['CP-0001'].salaryConfig.dailyRate).toBe(25000);
    expect(recalculated.sourceSnapshot!.departments.find(item => item.id === 'dept-correction')!.salary.dailyRate).toBe(25000);
  });

  test('operations admin cannot reopen archives or edit archived adjustments', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await goto(page, '/payroll');
    await page.getByLabel('شهر الرواتب', { exact: true }).fill('2026-08');
    await expect(page.getByRole('button', { name: 'إعادة فتح للتعديل', exact: true })).toHaveCount(0);
    await expect(page.getByText('إعادة الفتح للمشرف العام فقط', { exact: false })).toBeVisible();
    await goto(page, '/deductions');
    await page.getByLabel('الشهر', { exact: true }).fill('2026-08');
    await expect(page.getByRole('button', { name: 'إضافة خصم', exact: true }).first()).toBeDisabled();
    await expect(page.locator('.desktop-table').getByRole('button', { name: 'تعديل خصم علي محمد حسن', exact: true })).toBeDisabled();
  });

  test('employee salary ignores another employee query and exposes no administrative controls', async ({ page }) => {
    await login(page, 'موظف');
    await goto(page, '/employee/salary?employee=CP-0002');
    await expect(page.getByRole('heading', { name: 'راتبي', exact: true })).toBeVisible();
    // CP-0001 has 22 present days, one excused absence and one unresolved required day.
    // Salary is based on all 24 required days, with the excused deduction applied once.
    await expect(page.getByText('الأيام المطلوبة', { exact: true }).locator('..').locator('strong')).toHaveText('24');
    await expect(page.getByText('أيام الحضور', { exact: true }).locator('..').locator('strong')).toHaveText('22');
    await expect(page.getByText('الراتب الأساسي', { exact: true }).locator('..')).toContainText('600,000 د.ع');
    await expect(page.getByText('صافي الراتب', { exact: true }).locator('..')).toContainText('610,000 د.ع');
    await expect(page.getByText('اعتراض على تصحيح السؤال رقم 4 بعد مراجعة الإجابة.', { exact: true })).toBeVisible();
    await expect(page.getByText('تعديل مالي بعد الصرف يحتاج إلى مراجعة الإدارة.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /تسجيل.*صرف|إضافة مكافأة|إضافة خصم/ })).toHaveCount(0);
    await page.getByLabel('شهر راتبي', { exact: true }).fill('2026-08');
    await expect(page.getByText('اعتراض تصحيح معتمد للشهر السابق.', { exact: true })).toBeVisible();
    await goto(page, '/reports');
    await expect(page).toHaveURL(/\/employee$/);
  });

  test('report type changes clear irrelevant date filters and Excel preserves required days, numeric and date cells', async ({ page }) => {
    await login(page);
    await goto(page, '/reports?type=attendance&employee=CP-0002');
    await page.getByLabel('من تاريخ', { exact: false }).fill('2026-09-28');
    await page.getByLabel('إلى تاريخ', { exact: false }).fill('2026-09-20');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('تاريخ البداية');
    await page.getByRole('button', { name: 'قسيمة راتب', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    const report = page.getByRole('article', { name: 'معاينة التقرير', exact: true });
    await expect(report).toContainText('625,000 د.ع');
    await expect(report).toContainText('إنجاز مراجعة الدفعة الإضافية من الامتحانات.');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path!);
    expect(workbook.worksheets).toHaveLength(4);
    expect(workbook.worksheets[0].getCell('B9').value).toBe(-25000);
    expect(workbook.worksheets[0].getCell('B11').value).toBe(625000);
    expect(workbook.worksheets[0].views[0].rightToLeft).toBe(true);
    expect(String(workbook.worksheets[0].getCell('A3').value)).toContain('تجريبية');
    expect(workbook.worksheets[1].getCell('A6').value).toBeInstanceOf(Date);
    expect(workbook.worksheets[1].getCell('B6').value).toBe(650000);

    await page.getByRole('button', { name: 'كشف رواتب الشهر', exact: true }).click();
    await page.getByLabel('الموظف', { exact: true }).selectOption('CP-0001');
    await expect(report.getByRole('columnheader')).toHaveCount(14);
    await expect(report.getByRole('columnheader').nth(4)).toHaveText('الأيام المطلوبة');
    const cells = report.locator('tbody tr').filter({ hasText: 'CP-0001' }).getByRole('cell');
    await expect(cells.nth(4)).toHaveText('24');
    await expect(cells.nth(5)).toHaveText('22');
    await expect(cells.nth(8)).toHaveText('600,000 د.ع');
    await expect(cells.nth(12)).toHaveText('610,000 د.ع');
    const payrollDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excel', exact: true }).click();
    const payrollDownload = await payrollDownloadPromise;
    const payrollPath = await payrollDownload.path();
    expect(payrollPath).toBeTruthy();
    const payrollWorkbook = new ExcelJS.Workbook();
    await payrollWorkbook.xlsx.readFile(payrollPath!);
    expect(payrollWorkbook.worksheets).toHaveLength(1);
    const sheet = payrollWorkbook.worksheets[0];
    expect(sheet.getCell('A6').value).toBe('CP-0001');
    // The added required-days column moves attendance to F, base to I and net to M.
    expect(sheet.getCell('E5').value).toBe('الأيام المطلوبة');
    expect(sheet.getCell('F5').value).toBe('حضور');
    expect(sheet.getCell('I5').value).toBe('الأساسي');
    expect(sheet.getCell('M5').value).toBe('الصافي');
    for (const [address, value] of [['E6', 24], ['F6', 22], ['G6', 1], ['I6', 600000], ['J6', 25000], ['M6', 610000]] as const) {
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.Number);
      expect(sheet.getCell(address).value).toBe(value);
    }
    expect(sheet.getCell('E6').numFmt).toBe('0');
    expect(sheet.getCell('M6').numFmt).toContain('د.ع');
  });

  test('generates actual branded PDF and print tables stay within A4 width', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'PDF generation requires Chromium.');
    await login(page);
    await goto(page, '/reports?type=payroll');
    await page.setViewportSize({ width: 1123, height: 794 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const report = page.getByRole('article', { name: 'معاينة التقرير', exact: true });
    await expect(report).toBeVisible();
    await expect(report.getByRole('columnheader')).toHaveCount(14);
    await expect(report.getByRole('columnheader', { name: 'الأيام المطلوبة', exact: true })).toBeVisible();
    // Screen typography must not override the compact, white A4 report in either theme.
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ media: 'screen' });
      if (theme === 'dark') await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.emulateMedia({ media: 'print' });
      await expect(report.getByRole('table')).toHaveCSS('font-size', '10px');
      await expect(report.getByRole('columnheader').first()).toHaveCSS('font-size', '10px');
      await expect(report.locator('footer')).toHaveCSS('font-size', '9px');
      await expect(report.getByText('بيانات تجريبية للمعاينة — غير معتمدة مالياً', { exact: true })).toHaveCSS('font-size', '9px');
      await expect(report).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(report).toHaveCSS('color', 'rgb(17, 19, 24)');
    }
    const geometry = await report.evaluate(element => ({ width: element.getBoundingClientRect().width, viewport: document.documentElement.clientWidth, tables: [...element.querySelectorAll('table')].map(table => ({ width: table.getBoundingClientRect().width, parent: table.parentElement!.getBoundingClientRect().width })) }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport + 1);
    for (const table of geometry.tables) expect(table.width).toBeLessThanOrEqual(table.parent + 1);
    const pdf = await page.pdf({ path: testInfo.outputPath('CenterPro-payroll-preview.pdf'), preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(15000);
    // Chromium writes uncompressed page dictionaries; the 14-row fixture must include its totals on one page.
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
    await expect(report.getByRole('img', { name: 'CenterPro', exact: true })).toBeVisible();
    await testInfo.attach('actual-report-pdf', { body: pdf, contentType: 'application/pdf' });
    await testInfo.attach('print-layout', { body: await report.screenshot(), contentType: 'image/png' });
  });
});


test('empty finance startup has useful prerequisites and never creates operational records', async ({ page }) => {
  await login(page);
  await goto(page, '/payroll');
  await expect(page.getByText('لا توجد بيانات رواتب حتى الآن.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إغلاق وأرشفة الشهر', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'إضافة أول قسم', exact: true })).toHaveAttribute('href', '/departments');
  for (const [route, action, title] of [['deductions', 'إضافة خصم', 'لا توجد خصومات.'], ['bonuses', 'إضافة مكافأة', 'لا توجد مكافآت.']]) {
    await goto(page, `/${route}?add=1`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: action, exact: true })).toBeDisabled();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText('أضف موظفاً أولاً.', { exact: false })).toBeVisible();
  }
  await goto(page, '/reports');
  await expect(page.getByText('لا توجد بيانات للتقارير حتى الآن.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excel', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'طباعة / حفظ PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'قسيمة راتب', exact: true }).click();
  await expect(page.getByLabel('الموظف', { exact: true })).toHaveText('لا يوجد موظفون');
  const initial = await data(page);
  for (const key of ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit'] as const) expect(initial[key]).toHaveLength(0);
});
