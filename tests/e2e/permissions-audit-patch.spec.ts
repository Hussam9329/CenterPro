import type { Page } from '@playwright/test';
import { buildEvaluationCycleSnapshot } from '../../src/lib/evaluations';
import type { AccountPermission, DemoData } from '../../src/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { test, expect, gotoPreview, loginAccount, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const auditorId = 'CP-0004';
const correctorId = 'CP-0001';
const correctorName = 'علي محمد حسن';
const openExamId = 'permission-open-exam';
const closedExamId = 'permission-closed-exam';
const timestamp = '2026-09-28T08:00:00.000Z';

function auditFixture(permission: AccountPermission = { view: true, create: true, edit: true, delete: true }): DemoData {
  const data = createPopulatedTestData();
  data.departments.find(item => item.id === 'dept-correction')!.name = 'قسم التصحيح';
  const auditor = data.employees.find(item => item.id === auditorId)!;
  // The grant belongs to this account even outside the audit department.
  auditor.departmentId = 'dept-followup';
  auditor.permissions = { AUDIT_REVIEW: permission };
  data.evaluationSeasons = [{ id: 'permission-season', name: 'موسم اختبار الصلاحيات', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationCycles = [{ id: 'permission-cycle', seasonId: 'permission-season', name: 'دورة اختبار الصلاحيات', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationExams = [
    { id: openExamId, cycleId: 'permission-cycle', name: 'امتحان الصلاحيات المفتوح', date: '2026-09-28', state: 'OPEN', note: '', createdAt: timestamp, createdBy: 'مدير النظام' },
    { id: closedExamId, cycleId: 'permission-cycle', name: 'امتحان الصلاحيات المغلق', date: '2026-09-27', state: 'CLOSED', note: '', createdAt: timestamp, createdBy: 'مدير النظام', closedAt: timestamp, closedBy: 'مدير النظام' },
  ];
  data.examEvaluations = data.evaluationExams.map(exam => ({
    id: `entry-${exam.id}`, examId: exam.id, employeeId: correctorId,
    papers: 42, correctionErrors: 1, behaviorErrors: 0, note: '',
    createdAt: timestamp, updatedAt: timestamp, createdBy: auditor.name, updatedBy: auditor.name,
  }));
  return data;
}

function editor(page: Page) { return page.getByRole('article', { name: `تدقيق ${correctorName}`, exact: true }); }
async function enter(page: Page, data: DemoData, account = 'SYSTEM') {
  await seedPopulatedPreview(page, data);
  await loginAccount(page, account);
}

test('delete-only audit permission works independently of editing and keeps closed results protected on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = auditFixture({ view: true, create: false, edit: false, delete: true });
  await enter(page, fixture, auditorId);
  await page.getByRole('navigation', { name: 'التنقل السريع', exact: true }).getByRole('link', { name: 'التدقيق', exact: true }).click();
  const card = editor(page);
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true })).toBeDisabled();
  const remove = card.getByRole('button', { name: `حذف تقييم ${correctorName}`, exact: true });
  await expect(remove).toBeEnabled();

  await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption(closedExamId);
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
  await expect(remove).toHaveCount(0);
  await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption(openExamId);
  await remove.click();
  const dialog = page.getByRole('dialog', { name: `حذف تقييم ${correctorName}؟`, exact: true });
  await expect(dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true })).toBeDisabled();
  await dialog.getByLabel('سبب الحذف', { exact: false }).fill('إدخال مكرر أثناء اختبار الصلاحيات');
  await dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText('لم يُدخل بعد');
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
  const saved = await readPreviewData(page);
  expect(saved.examEvaluations).toEqual(fixture.examEvaluations.filter(item => item.examId === closedExamId));
  expect(saved.audit[0]).toMatchObject({ action: 'حذف آمن مؤكد', actor: fixture.employees.find(item => item.id === auditorId)!.name, entity: 'examEvaluations' });
  expect(saved.employees).toEqual(fixture.employees);
  await page.reload();
  await expect(card).toContainText('لم يُدخل بعد');
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
});

test('owner edits exam metadata and open audit values while closed numeric values and manager access stay locked', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const fixture = auditFixture();
  await enter(page, fixture);
  await gotoPreview(page, `/evaluations/${closedExamId}`);
  const card = editor(page);
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: /^حذف تقييم/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'تعديل التفاصيل', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'تعديل تفاصيل الامتحان', exact: true });
  await dialog.getByLabel('اسم الامتحان', { exact: false }).fill('عنوان امتحان محدّث');
  await dialog.getByLabel('تاريخ الامتحان', { exact: false }).fill('2026-09-26');
  await dialog.getByLabel('ملاحظة', { exact: true }).fill('تفاصيل راجعها المشرف العام');
  await dialog.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'عنوان امتحان محدّث', level: 1, exact: true })).toBeVisible();
  let saved = await readPreviewData(page);
  expect(saved.evaluationExams.find(item => item.id === closedExamId)).toMatchObject({ state: 'CLOSED', date: '2026-09-26', note: 'تفاصيل راجعها المشرف العام', closedAt: timestamp, closedBy: 'مدير النظام' });
  expect(saved.examEvaluations).toEqual(fixture.examEvaluations);

  await gotoPreview(page, `/evaluations/${openExamId}`);
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeEnabled();
  await card.getByLabel('عدد الأوراق المصححة', { exact: true }).fill('56');
  await page.clock.runFor(500);
  await expect(card.getByRole('status')).toContainText('تم الحفظ');
  saved = await readPreviewData(page);
  expect(saved.examEvaluations.find(item => item.examId === openExamId)).toMatchObject({ papers: 56, correctionErrors: 1, updatedBy: 'مدير النظام' });
  await page.getByRole('button', { name: 'إغلاق التدقيق', exact: true }).click();
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
  await page.reload();
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toHaveValue('56');
  await expect(card.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();

  const manager = fixture.employees.find(item => item.role === 'ADMIN')!;
  await loginAccount(page, manager.id);
  await gotoPreview(page, `/evaluations/${closedExamId}`);
  await expect(page.getByRole('heading', { name: 'عنوان امتحان محدّث', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تعديل التفاصيل', exact: true })).toHaveCount(0);
  await expect(card).toHaveCount(0);
});

test('archived cycle preserves metadata and numeric snapshots even for the owner', async ({ page }) => {
  const fixture = auditFixture();
  fixture.evaluationExams.forEach(exam => { exam.state = 'CLOSED'; exam.closedAt = timestamp; exam.closedBy = 'مدير النظام'; });
  const cycle = fixture.evaluationCycles[0];
  cycle.snapshot = buildEvaluationCycleSnapshot(fixture, cycle.id);
  cycle.state = 'ARCHIVED';
  cycle.closedAt = timestamp;
  cycle.closedBy = 'مدير النظام';
  await enter(page, fixture);
  await gotoPreview(page, `/evaluations/${openExamId}`);
  await expect(page.getByRole('heading', { name: 'امتحان الصلاحيات المفتوح', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تعديل التفاصيل', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /إعادة الفتح|إغلاق التدقيق/ })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await page.getByRole('button', { name: `حذف تقييم ${correctorName}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `حذف تقييم ${correctorName}؟`, exact: true });
  await expect(dialog.getByRole('alert').filter({ hasText: 'Drive مؤرشف' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'تأكيد الحذف', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await page.reload();
  const saved = await readPreviewData(page);
  expect(saved.evaluationCycles).toEqual(fixture.evaluationCycles);
  expect(saved.evaluationExams).toEqual(fixture.evaluationExams);
  expect(saved.examEvaluations).toEqual(fixture.examEvaluations);
});
