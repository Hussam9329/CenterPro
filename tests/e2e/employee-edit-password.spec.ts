import type { Page } from '@playwright/test';
import type { AuthStore } from '../../src/lib/local-auth';
import { createPopulatedTestData } from '../fixtures/populated-data';
import {
  test, expect, gotoPreview, loginAccount, seedPopulatedPreview, readPreviewData,
  readPreviewSession, AUTH_STORAGE_KEY, TEST_PASSWORD, fillLoginCredentials, submitLogin,
} from './helpers/preview';

async function readAuth(page: Page): Promise<AuthStore> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), AUTH_STORAGE_KEY);
}

async function editEmployee(page: Page, id: string) {
  await gotoPreview(page, `/employees/${id}`);
  await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
  return page.getByRole('dialog', { name: 'تعديل بيانات الموظف', exact: true });
}

test.describe('Password changes inside employee information', () => {
  test.use({ viewport: { width: 1366, height: 900 } });
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page); });

  test('admin saves a new employee password with profile edits and the previous password stops working', async ({ page }, testInfo) => {
    const fixture = createPopulatedTestData();
    fixture.employees.find(employee => employee.id === 'CP-0001')!.permissions = {
      AUDIT_REVIEW: { view: true, create: true, edit: false, delete: true },
      BONUSES: { view: true, create: false, edit: false, delete: false },
    };
    await seedPopulatedPreview(page, fixture);
    await loginAccount(page, 'CP-0013');
    for (const protectedAccount of ['CP-0012', 'CP-0013']) {
      await gotoPreview(page, `/employees/${protectedAccount}`);
      await expect(page.getByRole('button', { name: 'تعديل الملف', exact: true })).toBeDisabled();
    }
    const before = await readPreviewData(page);
    const beforeAuth = await readAuth(page);
    const form = await editEmployee(page, 'CP-0001');
    const changedName = 'علي محمد حسن بعد تحديث الحساب';
    await form.getByLabel('الاسم الكامل', { exact: false }).fill(changedName);
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    const password = form.getByLabel('كلمة المرور الجديدة', { exact: false });
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await expect(password).not.toHaveAttribute('required', '');
    await page.screenshot({ path: testInfo.outputPath('edit-password.png') });
    await password.fill('short');
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('6 أحرف أو أرقام على الأقل');
    expect(await readPreviewData(page)).toEqual(before);
    expect(await readAuth(page)).toEqual(beforeAuth);

    const secret = 'Edit-Employee-Password-743';
    await password.fill(secret);
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await form.getByRole('button', { name: 'السابق', exact: true }).click();
    await expect(password).toHaveValue(secret);
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('heading', { name: changedName, exact: true })).toBeVisible();
    const saved = await readPreviewData(page);
    const employee = saved.employees.find(item => item.id === 'CP-0001')!;
    expect(employee).toMatchObject({ name: changedName, code: 'CP-0001', role: 'EMPLOYEE' });
    expect(employee.permissions).toEqual(before.employees.find(item => item.id === employee.id)?.permissions);
    expect(saved.attendance).toEqual(before.attendance);
    const changedCredential = (await readAuth(page)).employees[employee.id];
    expect(changedCredential.version).toBe(beforeAuth.employees[employee.id].version + 1);
    expect(changedCredential.hash).not.toBe(beforeAuth.employees[employee.id].hash);
    expect(changedCredential.salt).not.toBe(beforeAuth.employees[employee.id].salt);
    expect(saved.audit[0]).toMatchObject({ action: 'تعديل بيانات موظف', employeeId: employee.id, role: 'ADMIN', newValues: { passwordChanged: true, sessionsInvalidated: true } });
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(secret);

    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await fillLoginCredentials(page, employee.username, TEST_PASSWORD);
    await submitLogin(page);
    await expect(page.locator('form').getByRole('alert')).toContainText('اسم المستخدم أو كلمة المرور غير صحيحة');
    expect(await readPreviewSession(page)).toBeNull();
    await loginAccount(page, employee.id, false, secret);
    expect(await readPreviewSession(page)).toMatchObject({ employeeId: employee.id, authVersion: changedCredential.version });
  });

  test('system owner can edit administrator passwords and a super admin self-edit records changes before logout', async ({ page }) => {
    await loginAccount(page);
    const beforeAuth = await readAuth(page);
    const form = await editEmployee(page, 'CP-0013');
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    const secret = 'Edit-Administrator-Password-593';
    await form.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(secret);
    await form.getByRole('button', { name: /إعدادات الراتب/ }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    expect((await readAuth(page)).system).toEqual(beforeAuth.system);
    expect((await readAuth(page)).employees['CP-0013'].version).toBe(beforeAuth.employees['CP-0013'].version + 1);
    const event = (await readPreviewData(page)).audit.find(item => item.employeeId === 'CP-0013' && item.newValues.sessionsInvalidated === true);
    expect(event).toMatchObject({ role: 'SUPER_ADMIN' });
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await loginAccount(page, 'CP-0013', false, secret);
    expect(await readPreviewSession(page)).toMatchObject({ employeeId: 'CP-0013', role: 'ADMIN', authVersion: 2 });

    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await loginAccount(page, 'CP-0012');
    const originalOwner = (await readPreviewData(page)).employees.find(item => item.id === 'CP-0012')!;
    const selfForm = await editEmployee(page, 'CP-0012');
    const updatedOwnerName = 'حسن أحمد فلاح بعد تحديث حسابه';
    const ownSecret = 'Edit-Own-Super-Password-815';
    await selfForm.getByLabel('الاسم الكامل', { exact: false }).fill(updatedOwnerName);
    await selfForm.getByRole('button', { name: /حساب الدخول/ }).click();
    await selfForm.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(ownSecret);
    await selfForm.getByRole('button', { name: /إعدادات الراتب/ }).click();
    await selfForm.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await readPreviewSession(page)).toBeNull();
    const ownSaved = await readPreviewData(page);
    expect(ownSaved.employees.find(item => item.id === 'CP-0012')?.name).toBe(updatedOwnerName);
    expect(ownSaved.audit[0]).toMatchObject({ action: 'تعديل بيانات موظف', actor: originalOwner.name, role: 'SUPER_ADMIN', employeeId: originalOwner.id, newValues: { passwordChanged: true, sessionsInvalidated: true } });
    expect((await readAuth(page)).employees['CP-0012'].version).toBe(beforeAuth.employees['CP-0012'].version + 1);
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(ownSecret);
    await fillLoginCredentials(page, originalOwner.username, TEST_PASSWORD);
    await submitLogin(page);
    await expect(page.locator('form').getByRole('alert')).toContainText('اسم المستخدم أو كلمة المرور غير صحيحة');
    await loginAccount(page, 'CP-0012', false, ownSecret);
    expect(await readPreviewSession(page)).toMatchObject({ employeeId: 'CP-0012', name: updatedOwnerName, role: 'SUPER_ADMIN', authVersion: 2 });
  });

  test('blank passwords preserve credentials and cancelling discards an unsaved password', async ({ page }) => {
    await loginAccount(page, 'CP-0013');
    const beforeAuth = await readAuth(page);
    let form = await editEmployee(page, 'CP-0001');
    const changedName = 'علي محمد حسن مع الإبقاء على كلمة المرور';
    await form.getByLabel('الاسم الكامل', { exact: false }).fill(changedName);
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    await expect(form.getByLabel('كلمة المرور الجديدة', { exact: false })).toHaveValue('');
    await form.getByRole('button', { name: /إعدادات الراتب/ }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    expect(await readAuth(page)).toEqual(beforeAuth);
    const saved = await readPreviewData(page);
    expect(saved.employees.find(item => item.id === 'CP-0001')?.name).toBe(changedName);
    expect(saved.audit[0].newValues.sessionsInvalidated).not.toBe(true);

    form = await editEmployee(page, 'CP-0001');
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    const discarded = 'Cancelled-Employee-Password-724';
    await form.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(discarded);
    await form.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await expect(form).toBeHidden();
    expect(await readAuth(page)).toEqual(beforeAuth);
    expect(await readPreviewData(page)).toEqual(saved);
    form = await editEmployee(page, 'CP-0001');
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    await expect(form.getByLabel('كلمة المرور الجديدة', { exact: false })).toHaveValue('');
    await form.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(discarded);
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await loginAccount(page, 'CP-0001');
    expect(await readPreviewSession(page)).toMatchObject({ employeeId: 'CP-0001', authVersion: 1 });
  });

  test('a failed credential write leaves the profile, old password and audit intact until retry succeeds', async ({ page }) => {
    await loginAccount(page, 'CP-0013');
    const before = await readPreviewData(page);
    const beforeAuth = await readAuth(page);
    const form = await editEmployee(page, 'CP-0001');
    await form.getByLabel('الاسم الكامل', { exact: false }).fill('علي محمد حسن بعد إعادة المحاولة');
    await form.getByRole('button', { name: /حساب الدخول/ }).click();
    const secret = 'Retry-Employee-Password-538';
    await form.getByLabel('كلمة المرور الجديدة', { exact: false }).fill(secret);
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          Storage.prototype.setItem = original;
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        }
        return original.call(this, name, value);
      };
    }, AUTH_STORAGE_KEY);
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('تعذر حفظ حساب الدخول');
    expect(await readPreviewData(page)).toEqual(before);
    expect(await readAuth(page)).toEqual(beforeAuth);
    await expect(form.getByLabel('كلمة المرور الجديدة', { exact: false })).toHaveValue(secret);
    await form.getByRole('button', { name: 'التالي', exact: true }).click();
    await form.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(form).toBeHidden();
    const saved = await readPreviewData(page);
    expect(saved.employees.find(item => item.id === 'CP-0001')?.name).toBe('علي محمد حسن بعد إعادة المحاولة');
    expect((await readAuth(page)).employees['CP-0001'].version).toBe(beforeAuth.employees['CP-0001'].version + 1);
    expect(saved.audit.filter(item => item.employeeId === 'CP-0001' && item.newValues.sessionsInvalidated === true)).toHaveLength(1);
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(secret);
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await loginAccount(page, 'CP-0001', false, secret);
  });
});
