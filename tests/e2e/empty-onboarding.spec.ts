import { test, expect, gotoPreview, loginPreview, readPreviewData, PREVIEW_STORAGE_KEY } from './helpers/preview';

test.describe('Fresh CenterPro onboarding', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('starts empty and guides the owner from a department to the first employee', async ({ page }) => {
    await loginPreview(page);
    let state = await readPreviewData(page);
    for (const collection of ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit'] as const) expect(state[collection]).toEqual([]);

    await gotoPreview(page, '/employees?add=1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('أضف قسماً أولاً قبل إضافة الموظفين.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة موظف', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'الأقسام', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'لا توجد أقسام حتى الآن', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إضافة أول قسم', exact: true }).click();
    const departmentDialog = page.getByRole('dialog', { name: 'إضافة قسم جديد', exact: true });
    await departmentDialog.getByLabel('اسم القسم', { exact: false }).fill('فريق العمليات');
    await expect(departmentDialog.getByLabel('نوع الراتب', { exact: true })).toHaveValue('TIERED');
    await expect(departmentDialog.getByLabel('نوع الراتب', { exact: true }).locator('option')).toHaveText(['غير قطعي', 'قطعي']);
    await expect(departmentDialog.getByRole('heading', { name: 'قوانين القسم', exact: true })).toBeVisible();
    await expect(departmentDialog.getByRole('button', { name: 'إضافة قانون', exact: true })).toBeVisible();
    await expect(departmentDialog.getByText('القانون 1', { exact: true })).toBeVisible();
    await expect(departmentDialog).not.toContainText(/شريحة|شرائح|نظام شرائح/);
    await departmentDialog.getByLabel('قيمة اليومية', { exact: false }).fill('25000');
    await departmentDialog.getByLabel('خصم الغياب بدون عذر', { exact: false }).fill('50000');
    await departmentDialog.getByLabel('الحد الأعلى للراتب', { exact: false }).fill('600000');
    await departmentDialog.getByRole('button', { name: 'إضافة القسم', exact: true }).click();
    await expect(departmentDialog).toBeHidden();
    state = await readPreviewData(page);
    expect(state.departments).toHaveLength(1);
    expect(state.employees).toHaveLength(0);
    const departmentId = state.departments[0].id;
    await expect(page.getByText('غير قطعي', { exact: true })).toBeVisible();

    await gotoPreview(page, '/employees');
    await expect(page.getByRole('heading', { name: 'لا يوجد موظفون حتى الآن', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إضافة أول موظف', exact: true }).click();
    const employeeDialog = page.getByRole('dialog', { name: 'إضافة موظف جديد', exact: true });
    await employeeDialog.getByLabel('الاسم الكامل', { exact: false }).fill('موظف الفريق الأول');
    await employeeDialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await employeeDialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await employeeDialog.getByLabel('القسم', { exact: false }).selectOption(departmentId);
    await employeeDialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await employeeDialog.getByLabel('اسم المستخدم', { exact: false }).fill('FIRST01');
    const password = 'Never-persist-this-preview-password';
    await employeeDialog.getByLabel('كلمة المرور الأولية', { exact: false }).fill(password);
    await employeeDialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await expect(employeeDialog.getByText('غير قطعي', { exact: true })).toBeVisible();
    await employeeDialog.getByRole('button', { name: 'إضافة الموظف', exact: true }).click();
    await expect(employeeDialog).toBeHidden();
    state = await readPreviewData(page);
    expect(state.employees).toHaveLength(1);
    expect(state.employees[0]).toMatchObject({ code: 'CP-0001', name: 'موظف الفريق الأول', role: 'EMPLOYEE', departmentId });
    expect(state.audit.map(item => item.action)).toContain('إضافة موظف وحساب دخول');
    expect(state.audit.map(item => item.action)).toContain('إضافة قسم');
    expect(await page.evaluate(key => sessionStorage.getItem(key), PREVIEW_STORAGE_KEY)).not.toContain(password);
    await expect(page.getByLabel('نوع الراتب', { exact: true }).locator('option')).toHaveText(['جميع الأنواع', 'غير قطعي', 'قطعي']);
    await expect(page.locator('.desktop-table tbody')).toContainText('غير قطعي');
    await expect(page.locator('main')).not.toContainText(/شريحة|شرائح|نظام شرائح/);
  });

  test('an inactive-only department collection cannot open a broken employee form', async ({ page }) => {
    await loginPreview(page);
    await gotoPreview(page, '/departments?add=1');
    let dialog = page.getByRole('dialog', { name: 'إضافة قسم جديد', exact: true });
    await dialog.getByLabel('اسم القسم', { exact: false }).fill('قسم موقوف للاختبار');
    await dialog.getByLabel('نوع الراتب', { exact: true }).selectOption('FIXED');
    await dialog.getByLabel('الراتب القطعي', { exact: false }).fill('500000');
    await dialog.getByRole('button', { name: 'إضافة القسم', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'إيقاف قسم قسم موقوف للاختبار', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'إيقاف القسم؟', exact: true });
    await dialog.getByRole('button', { name: 'تأكيد إيقاف القسم', exact: true }).click();
    await expect(dialog).toBeHidden();
    await gotoPreview(page, '/employees?add=1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'لا توجد أقسام نشطة', exact: true })).toBeVisible();
    expect((await readPreviewData(page)).employees).toEqual([]);
  });
});
