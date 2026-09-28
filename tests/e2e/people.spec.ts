import { expect, test, type Page } from '@playwright/test';
import type { DemoData } from '../../src/lib/types';

async function login(page: Page, role: 'المدير العام' | 'مدير العمليات' | 'موظف' = 'المدير العام') {
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await expect(page).toHaveURL(role === 'موظف' ? /\/employee$/ : /\/dashboard$/);
  await expect(page.locator('.brand-intro')).toBeHidden();
}

async function data(page: Page): Promise<DemoData> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('centerpro-ui-preview-v1') || '{}').data);
}

test.describe('Employee and department preview workflows', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('creates employee and account through grouped form with unique case-insensitive username', async ({ page }) => {
    await login(page);
    await page.goto('/employees');
    await page.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'إضافة موظف جديد', exact: true });
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('اكتب الاسم الكامل');
    await dialog.getByLabel('الاسم الكامل', { exact: false }).fill('اختبار موظف جديد');
    await dialog.getByLabel('الجنس', { exact: true }).selectOption('FEMALE');
    await dialog.getByLabel('تاريخ الميلاد', { exact: true }).fill('1998-02-18');
    await dialog.getByLabel('التحصيل الدراسي', { exact: true }).fill('بكالوريوس علوم');
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await dialog.getByLabel('رقم الهاتف', { exact: true }).fill('07000001234');
    await dialog.getByLabel('رقم هاتف ولي الأمر', { exact: true }).fill('07000005678');
    await dialog.getByLabel('البريد الإلكتروني', { exact: true }).fill('test@example.invalid');
    await dialog.getByLabel('العنوان / محل السكن', { exact: true }).fill('بغداد — عنوان تجريبي');
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await dialog.getByLabel('القسم', { exact: false }).selectOption('dept-correction');
    await dialog.getByLabel('تاريخ المباشرة', { exact: false }).fill('2026-09-20');
    await expect(dialog.getByLabel('الرقم الوظيفي', { exact: true })).toHaveValue('يُنشأ تلقائياً عند الحفظ');
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    const password = 'Preview-Create-Secret-438';
    await dialog.getByLabel('اسم المستخدم', { exact: false }).fill('emp001');
    await dialog.getByLabel('كلمة المرور الأولية', { exact: false }).fill(password);
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('اسم المستخدم مستخدم مسبقاً');
    await dialog.getByLabel('اسم المستخدم', { exact: false }).fill('TEST100');
    await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'هذا الموظف راتبه قطعي', exact: true }).check();
    await dialog.getByLabel('الراتب القطعي (د.ع)', { exact: false }).fill('1000000');
    await dialog.getByLabel('قيمة اليومية الخاصة (د.ع)', { exact: false }).fill('25000');
    await dialog.getByRole('button', { name: 'إضافة الموظف', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByPlaceholder('الاسم، الرقم الوظيفي أو الهاتف', { exact: true }).fill('TEST100');
    const row = page.locator('.desktop-table tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('اختبار موظف جديد');
    await expect(row).toContainText('CP-0015');
    await expect(row).toContainText('راتب قطعي');
    const state = await data(page);
    const created = state.employees.find(item => item.username === 'TEST100')!;
    expect(created).toMatchObject({ code: 'CP-0015', name: 'اختبار موظف جديد', gender: 'FEMALE', departmentId: 'dept-correction', startDate: '2026-09-20', fixedOverride: true, fixedSalary: 1000000, dailyRateOverride: 25000 });
    expect(created.photo).toBeUndefined();
    expect(state.audit[0]).toMatchObject({ action: 'إضافة موظف وحساب دخول', employeeId: created.id });
    expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v1'))).not.toContain(password);
  });

  test('editing and confirmed deactivation retain employee code and all historical records', async ({ page }) => {
    await login(page);
    await page.goto('/employees/CP-0001');
    const before = await data(page);
    const history = before.attendance.filter(item => item.employeeId === 'CP-0001');
    await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'تعديل بيانات الموظف', exact: true });
    await form.getByLabel('الاسم الكامل', { exact: false }).fill('علي محمد حسن المعدّل');
    await form.getByRole('button', { name: /إعدادات الراتب/ }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('heading', { name: 'علي محمد حسن المعدّل', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إيقاف الموظف', exact: true }).click();
    let confirm = page.getByRole('dialog', { name: 'تأكيد إيقاف الموظف', exact: true });
    await expect(confirm).toContainText('الاحتفاظ بملفه وسجلاته السابقة كاملة');
    await confirm.getByRole('button', { name: 'إلغاء', exact: true }).click();
    expect((await data(page)).employees.find(item => item.id === 'CP-0001')!.active).toBe(true);
    await page.getByRole('button', { name: 'إيقاف الموظف', exact: true }).click();
    confirm = page.getByRole('dialog', { name: 'تأكيد إيقاف الموظف', exact: true });
    await confirm.getByRole('button', { name: 'إيقاف الموظف', exact: true }).click();
    await expect(confirm).toBeHidden();
    const inactive = await data(page);
    expect(inactive.employees.find(item => item.id === 'CP-0001')).toMatchObject({ active: false, code: 'CP-0001' });
    expect(inactive.attendance.filter(item => item.employeeId === 'CP-0001')).toEqual(history);
    expect(inactive.months).toEqual(before.months);
    await page.getByRole('button', { name: 'تفعيل الموظف', exact: true }).click();
    confirm = page.getByRole('dialog', { name: 'تفعيل الموظف', exact: true });
    await confirm.getByRole('button', { name: 'تفعيل الموظف', exact: true }).click();
    await expect(confirm).toBeHidden();
    expect((await data(page)).employees.find(item => item.id === 'CP-0001')).toMatchObject({ active: true, code: 'CP-0001', name: 'علي محمد حسن المعدّل' });
  });

  test('password reset saves directly without old password, confirmation or stored secret', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await page.goto('/employees/CP-0001');
    await page.getByRole('button', { name: 'حساب الدخول', exact: true }).click();
    await page.getByRole('button', { name: 'تغيير كلمة المرور', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'تغيير كلمة المرور', exact: true });
    await expect(dialog.locator('input[type=password]')).toHaveCount(1);
    await expect(dialog.getByLabel(/كلمة المرور الحالية|كلمة المرور القديمة|تأكيد كلمة المرور/)).toHaveCount(0);
    const secret = 'Preview-Reset-Secret-8473';
    await dialog.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(secret);
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const state = await data(page);
    expect(state.audit[0]).toMatchObject({ action: 'محاكاة تغيير كلمة مرور الموظف', employeeId: 'CP-0001', newValues: { simulated: true } });
    expect(await page.evaluate(() => sessionStorage.getItem('centerpro-ui-preview-v1'))).not.toContain(secret);
  });

  test('fixed and tier configuration changes warn before affecting open payroll while archives stay intact', async ({ page }) => {
    await login(page);
    await page.goto('/departments');
    const before = await data(page);
    const correctionCard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'التصحيح', exact: true }) });
    await correctionCard.getByRole('button', { name: 'إعدادات القسم', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'إعدادات قسم التصحيح', exact: true });
    await dialog.getByLabel('نظام الراتب', { exact: true }).selectOption('FIXED');
    await dialog.getByLabel('الراتب القطعي', { exact: false }).fill('950000');
    await dialog.getByLabel('قيمة اليومية', { exact: false }).fill('35000');
    await dialog.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    let confirmation = page.getByRole('dialog', { name: 'تأكيد تعديل قواعد الراتب', exact: true });
    await expect(confirmation).toContainText('الشهر المفتوح حالياً');
    expect((await data(page)).departments[0].salary).toEqual(before.departments[0].salary);
    await confirmation.getByRole('button', { name: 'إلغاء', exact: true }).click();
    await dialog.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    await page.getByRole('dialog', { name: 'تأكيد تعديل قواعد الراتب', exact: true }).getByRole('button', { name: 'حفظ وإعادة الاحتساب', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    let state = await data(page);
    expect(state.departments[0].salary).toMatchObject({ mode: 'FIXED', fixedSalary: 950000, dailyRate: 35000 });
    expect(state.months).toEqual(before.months);
    await correctionCard.getByRole('button', { name: 'إعدادات القسم', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'إعدادات قسم التصحيح', exact: true });
    await dialog.getByLabel('نظام الراتب', { exact: true }).selectOption('TIERED');
    await dialog.getByLabel('من يوم', { exact: true }).nth(1).fill('4');
    await dialog.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('دون تداخل');
    await dialog.getByLabel('من يوم', { exact: true }).nth(1).fill('5');
    await dialog.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    confirmation = page.getByRole('dialog', { name: 'تأكيد تعديل قواعد الراتب', exact: true });
    await confirmation.getByRole('button', { name: 'حفظ وإعادة الاحتساب', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    state = await data(page);
    expect(state.departments[0].salary.mode).toBe('TIERED');
    expect(state.departments[0].salary.tiers[1].fromDays).toBe(5);
    expect(state.months).toEqual(before.months);
  });

  test('operations admin cannot change privileged accounts, roles or protected salary settings', async ({ page }) => {
    await login(page, 'مدير العمليات');
    await page.goto('/employees/CP-0012');
    await expect(page.getByRole('button', { name: 'تعديل الملف', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'إيقاف الموظف', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'حساب الدخول', exact: true }).click();
    await expect(page.getByRole('button', { name: 'تغيير كلمة المرور', exact: true })).toBeDisabled();
    await page.goto('/employees/CP-0001');
    await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'تعديل بيانات الموظف', exact: true });
    await dialog.getByRole('button', { name: /حساب الدخول/ }).click();
    await expect(dialog.getByLabel('الصلاحية', { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('الصلاحية', { exact: true }).locator('option')).toHaveCount(1);
    await dialog.getByRole('button', { name: /إعدادات الراتب/ }).click();
    await expect(dialog.getByRole('checkbox', { name: 'هذا الموظف راتبه قطعي', exact: true })).toBeDisabled();
    await expect(dialog).toContainText('إعدادات الراتب محمية');
    await dialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await page.goto('/departments');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'إضافة قسم', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إعدادات القسم', exact: true })).toHaveCount(0);
  });
});
