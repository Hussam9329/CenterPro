import { test, expect, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

test.describe('Private to-do list', () => {
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page); });

  test('each account keeps its own list, with details, filters, menu count and home card', async ({ page }) => {
    await loginPreview(page, 'موظف');
    const menu = page.getByRole('navigation', { name: 'القائمة الرئيسية' });
    await menu.getByRole('link', { name: 'To Do List' }).click();
    await expect(page).toHaveURL(/\/employee\/todos$/);
    await expect(page.getByRole('heading', { name: 'To Do List', exact: true })).toBeVisible();

    await page.getByLabel('إضافة مهمة سريعة').fill('مراجعة الكشوف');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /^مراجعة الكشوف/ })).toBeVisible();

    await page.getByRole('button', { name: 'مهمة جديدة' }).click();
    const dialog = page.getByRole('dialog', { name: 'مهمة جديدة' });
    await dialog.getByLabel(/^عنوان المهمة/).fill('تجهيز الامتحان');
    await dialog.getByText('عاجلة', { exact: true }).click();
    await dialog.getByRole('button', { name: 'اليوم', exact: true }).click();
    await dialog.getByLabel('الوقت', { exact: true }).fill('23:30');
    await dialog.getByLabel('ملاحظات', { exact: true }).fill('طباعة النسخ');
    await dialog.getByLabel('مهمة فرعية جديدة').fill('تصوير الأوراق');
    await dialog.getByLabel('مهمة فرعية جديدة').press('Enter');
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(menu.getByLabel('1 مهام لليوم أو متأخرة')).toBeVisible();
    await page.getByRole('button', { name: 'اليوم (1)' }).click();
    await expect(page.getByRole('button', { name: /^تجهيز الامتحان/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^مراجعة الكشوف/ })).toHaveCount(0);

    await page.getByRole('button', { name: /^تجهيز الامتحان/ }).click();
    await expect(page.getByText('طباعة النسخ')).toBeVisible();
    await page.getByRole('checkbox', { name: 'تصوير الأوراق' }).check();
    await expect(page.getByRole('progressbar', { name: 'تقدم المهام الفرعية' })).toHaveAttribute('aria-valuenow', '1');

    // A finished task leaves the open views straight away, so there is no checkbox left to re-read.
    await page.getByRole('checkbox', { name: 'إنجاز المهمة: تجهيز الامتحان' }).click();
    await expect(menu.getByLabel('1 مهام لليوم أو متأخرة')).toHaveCount(0);
    await page.getByRole('button', { name: 'المنجزة (1)' }).click();
    await expect(page.getByRole('button', { name: /^تجهيز الامتحان/ })).toBeVisible();

    await page.getByRole('button', { name: 'الكل (1)' }).click();
    await page.getByRole('button', { name: 'حذف: مراجعة الكشوف' }).click();
    await expect(page.getByRole('button', { name: /^مراجعة الكشوف/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'تراجع', exact: true }).click();
    await expect(page.getByRole('button', { name: /^مراجعة الكشوف/ })).toBeVisible();

    await gotoPreview(page, '/employee');
    await expect(page.getByRole('heading', { name: 'مهامي', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'إنجاز المهمة: مراجعة الكشوف' })).toBeVisible();

    await loginPreview(page);
    await expect(page.getByRole('heading', { name: 'مهامي', exact: true })).toBeVisible();
    await expect(page.getByText('مراجعة الكشوف')).toHaveCount(0);
    await gotoPreview(page, '/todos');
    await expect(page.getByText('لا توجد مهام مفتوحة')).toBeVisible();
    await expect(page.getByText('مراجعة الكشوف')).toHaveCount(0);
    await page.getByLabel('إضافة مهمة سريعة').fill('مهمة المدير العام');
    await page.getByRole('button', { name: 'إضافة', exact: true }).click();
    await expect(page.getByRole('button', { name: /^مهمة المدير العام/ })).toBeVisible();

    await loginPreview(page, 'مدير العمليات');
    await gotoPreview(page, '/todos');
    await expect(page.getByText('لا توجد مهام مفتوحة')).toBeVisible();
    await expect(page.getByText('مهمة المدير العام')).toHaveCount(0);

    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/todos');
    await expect(page.getByRole('button', { name: /^مراجعة الكشوف/ })).toBeVisible();
    await expect(page.getByText('مهمة المدير العام')).toHaveCount(0);
  });
});
