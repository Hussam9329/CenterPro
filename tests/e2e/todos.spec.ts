import ExcelJS from 'exceljs';
import { test, expect, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

test.describe('Private to-do list', () => {
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page); });

  test('the table adds and edits tasks in place, and rows hold still while typing', async ({ page }) => {
    await loginPreview(page, 'موظف');
    const menu = page.getByRole('navigation', { name: 'القائمة الرئيسية' });
    await menu.getByRole('link', { name: 'To Do List' }).click();
    await expect(page).toHaveURL(/\/employee\/todos$/);
    await expect(page.getByRole('table')).toBeVisible();

    // Fast entry: Enter adds the row and keeps the cursor in the new-task cell.
    const newTitle = page.getByLabel('عنوان مهمة جديدة');
    await newTitle.fill('مراجعة الكشوف');
    await newTitle.press('Enter');
    await expect(newTitle).toBeFocused();
    await expect(newTitle).toHaveValue('');
    await newTitle.fill('تجهيز الامتحان');
    await page.getByLabel('أولوية المهمة الجديدة').selectOption('URGENT');
    await page.getByLabel('تاريخ المهمة الجديدة').fill('2026-09-28');
    await page.getByLabel('وقت المهمة الجديدة').fill('23:30');
    await page.getByLabel('ملاحظات المهمة الجديدة').fill('طباعة النسخ');
    await page.getByLabel('ملاحظات المهمة الجديدة').press('Enter');
    await expect(page.getByLabel('عنوان المهمة: تجهيز الامتحان')).toHaveValue('تجهيز الامتحان');
    await expect(page.getByLabel('أولوية: تجهيز الامتحان')).toHaveValue('URGENT');
    await expect(menu.getByLabel('1 مهام لليوم أو متأخرة')).toBeVisible();

    // A date edit would re-sort the list, but not until the person leaves the table.
    const order = () => page.locator('tbody input[aria-label^="عنوان المهمة:"]').evaluateAll(cells => cells.map(cell => (cell as HTMLInputElement).value));
    expect(await order()).toEqual(['تجهيز الامتحان', 'مراجعة الكشوف']);
    await page.getByLabel('تاريخ: مراجعة الكشوف').fill('2026-09-20');
    await page.getByLabel('ملاحظات: مراجعة الكشوف').click();
    expect(await order()).toEqual(['تجهيز الامتحان', 'مراجعة الكشوف']);
    await page.getByRole('searchbox').or(page.getByLabel('ابحث في مهامك')).first().click();
    await expect.poll(order).toEqual(['مراجعة الكشوف', 'تجهيز الامتحان']);

    // Editing a cell saves on leaving it, Enter moves down the column, Esc restores.
    const title = page.getByLabel('عنوان المهمة: مراجعة الكشوف');
    await title.fill('مراجعة الكشوف النهائية');
    await title.press('Enter');
    await expect(page.getByLabel('عنوان المهمة: تجهيز الامتحان')).toBeFocused();
    await expect(page.getByLabel('عنوان المهمة: مراجعة الكشوف النهائية')).toBeVisible();
    const exam = page.getByLabel('عنوان المهمة: تجهيز الامتحان');
    await exam.fill('نص لن يُحفظ');
    await exam.press('Escape');
    await expect(exam).toHaveValue('تجهيز الامتحان');
    await exam.fill('');
    await page.getByLabel('ابحث في مهامك').click();
    await expect(page.getByLabel('عنوان المهمة: تجهيز الامتحان')).toHaveValue('تجهيز الامتحان');

    await page.reload();
    await expect(page.getByLabel('عنوان المهمة: مراجعة الكشوف النهائية')).toBeVisible();
    await expect(page.getByLabel('تاريخ: مراجعة الكشوف النهائية')).toHaveValue('2026-09-20');

    await page.getByRole('button', { name: 'المهام الفرعية: تجهيز الامتحان' }).click();
    await page.getByLabel('إضافة مهمة فرعية إلى: تجهيز الامتحان').fill('تصوير الأوراق');
    await page.getByLabel('إضافة مهمة فرعية إلى: تجهيز الامتحان').press('Enter');
    await page.getByRole('checkbox', { name: 'تصوير الأوراق' }).check();
    await expect(page.getByRole('progressbar', { name: 'تقدم المهام الفرعية' })).toHaveAttribute('aria-valuenow', '1');

    await page.getByRole('checkbox', { name: 'إنجاز المهمة: تجهيز الامتحان' }).check();
    await page.getByRole('button', { name: 'المنجزة (1)' }).click();
    await expect(page.getByLabel('عنوان المهمة: تجهيز الامتحان')).toBeVisible();
    await expect(page.getByLabel('عنوان مهمة جديدة')).toHaveCount(0);

    await page.getByRole('button', { name: 'الكل (1)' }).click();
    await page.getByRole('button', { name: 'حذف: مراجعة الكشوف النهائية' }).click();
    await expect(page.getByLabel('عنوان المهمة: مراجعة الكشوف النهائية')).toHaveCount(0);
    await page.getByRole('button', { name: 'تراجع', exact: true }).click();
    await expect(page.getByLabel('عنوان المهمة: مراجعة الكشوف النهائية')).toBeVisible();

    await gotoPreview(page, '/employee');
    await expect(page.getByRole('heading', { name: 'مهامي', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'إنجاز المهمة: مراجعة الكشوف النهائية' })).toBeVisible();
  });

  test('Excel and PDF export exactly the rows in the current view', async ({ page }) => {
    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/todos');
    await expect(page.getByRole('button', { name: 'تصدير Excel' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'تصدير PDF' })).toBeDisabled();
    const newTitle = page.getByLabel('عنوان مهمة جديدة');
    await newTitle.fill('مهمة بلا موعد');
    await newTitle.press('Enter');
    await newTitle.fill('=1+1 تسليم الكشف');
    await page.getByLabel('أولوية المهمة الجديدة').selectOption('URGENT');
    await page.getByLabel('تاريخ المهمة الجديدة').fill('2026-09-28');
    await page.getByLabel('وقت المهمة الجديدة').fill('23:30');
    await page.getByLabel('ملاحظات المهمة الجديدة').fill('قبل نهاية الدوام');
    await page.getByLabel('ملاحظات المهمة الجديدة').press('Enter');
    await page.getByRole('button', { name: 'اليوم (1)' }).click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير Excel' }).click()]);
    expect(download.suggestedFilename()).toBe('CenterPro-2026-09-28-To Do List.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile((await download.path())!);
    const sheet = workbook.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getRow(5).values).toEqual([undefined, '#', 'المهمة', 'الحالة', 'الأولوية', 'التاريخ', 'الوقت', 'ملاحظات', 'المهام الفرعية']);
    expect(sheet.getCell('A6').value).toBe(1);
    expect(sheet.getCell('B6').value).toBe('=1+1 تسليم الكشف');
    expect(sheet.getCell('C6').value).toBe('اليوم');
    expect(sheet.getCell('D6').value).toBe('عاجلة');
    expect((sheet.getCell('E6').value as Date).toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(sheet.getCell('F6').value).toBe('11:30‎ PM');
    expect(sheet.getCell('G6').value).toBe('قبل نهاية الدوام');
    expect(sheet.rowCount).toBe(6);

    await page.evaluate(() => { const state = window as typeof window & { printed?: string }; window.print = () => { state.printed = document.title; }; });
    await page.getByRole('button', { name: 'تصدير PDF' }).click();
    expect(await page.evaluate(() => (window as typeof window & { printed?: string }).printed)).toBe('CenterPro-2026-09-28-To Do List');
    const sheetOnPaper = page.getByTestId('todo-print-sheet');
    await expect(sheetOnPaper).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(sheetOnPaper).toBeVisible();
    await expect(sheetOnPaper).toContainText('=1+1 تسليم الكشف');
    await expect(sheetOnPaper).toContainText('28/09/2026');
    await expect(sheetOnPaper).not.toContainText('مهمة بلا موعد');
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByLabel('ابحث في مهامك')).toBeHidden();
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  test('each account keeps its own table', async ({ page }) => {
    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/todos');
    await page.getByLabel('عنوان مهمة جديدة').fill('مهمة الموظف الخاصة');
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();
    await expect(page.getByLabel('عنوان المهمة: مهمة الموظف الخاصة')).toBeVisible();

    await loginPreview(page);
    await expect(page.getByRole('heading', { name: 'مهامي', exact: true })).toBeVisible();
    await gotoPreview(page, '/todos');
    await expect(page.getByText('لا توجد مهام مفتوحة')).toBeVisible();
    await expect(page.getByLabel('عنوان المهمة: مهمة الموظف الخاصة')).toHaveCount(0);
    await page.getByLabel('عنوان مهمة جديدة').fill('مهمة المدير العام');
    await page.getByLabel('عنوان مهمة جديدة').press('Enter');
    await expect(page.getByLabel('عنوان المهمة: مهمة المدير العام')).toBeVisible();

    await loginPreview(page, 'مدير العمليات');
    await gotoPreview(page, '/todos');
    await expect(page.getByText('لا توجد مهام مفتوحة')).toBeVisible();
    await expect(page.getByLabel('عنوان المهمة: مهمة المدير العام')).toHaveCount(0);

    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/todos');
    await expect(page.getByLabel('عنوان المهمة: مهمة الموظف الخاصة')).toBeVisible();
    await expect(page.getByLabel('عنوان المهمة: مهمة المدير العام')).toHaveCount(0);
  });
});
