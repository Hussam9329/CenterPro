import type { Locator, Page } from '@playwright/test';
import { test, expect, finishWelcome, gotoPreview, readPreviewData, readPreviewSession } from './helpers/preview';

const correctorId = 'employee-abrar-haqi';
const auditorId = 'employee-jaafar-ali';

async function enterAccount(page: Page, id = 'SYSTEM') {
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(id === 'SYSTEM' ? /\/dashboard$/ : /\/employee$/);
}

async function loadExplicitTestData(page: Page) {
  await gotoPreview(page, '/login');
  await expect(page.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(1);
  expect((await readPreviewData(page)).employees).toEqual([]);
  await page.getByRole('button', { name: 'تحميل بيانات الاختبار', exact: true }).click();
  await expect(page.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(7);
  const state = await readPreviewData(page);
  expect(state.employees.map(employee => employee.name)).toEqual(['ابرار حقي', 'هبة محمد', 'فاطمة فراس', 'مريم عصام', 'جعفر علي', 'مريم فهد']);
  expect(state.evaluationCycles).toEqual([]);
  expect(state.evaluationExams).toEqual([]);
  expect(state.examEvaluations).toEqual([]);
  await enterAccount(page);
}

function card(page: Page, title: string) {
  return page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

function row(container: Locator, name = 'ابرار حقي') {
  return container.getByRole('row').filter({ hasText: name });
}

async function addExam(page: Page, name: string) {
  await page.getByRole('button', { name: 'إضافة امتحان', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'إضافة امتحان', exact: true });
  await dialog.getByLabel('اسم الامتحان', { exact: false }).fill(name);
  await dialog.getByLabel('تاريخ الامتحان', { exact: false }).fill('2026-10-03');
  await dialog.getByRole('button', { name: 'إضافة وفتح للتدقيق', exact: true }).click();
  await expect(dialog).toBeHidden();
  return (await readPreviewData(page)).evaluationExams.find(exam => exam.name === name)!;
}

async function createCycleAndExam(page: Page) {
  await gotoPreview(page, '/evaluations');
  await page.getByRole('button', { name: 'فتح دورة تقييم جديدة', exact: true }).click();
  const leaderboard = card(page, 'المحصلة النهائية الحالية');
  await expect(leaderboard.locator('tbody tr')).toHaveCount(4);
  for (const cells of await leaderboard.locator('tbody tr').all()) {
    await expect(cells.getByRole('cell').nth(7)).toHaveText('0');
    await expect(cells.getByRole('cell').nth(6)).toHaveText('—');
  }
  return addExam(page, 'امتحان الدورة الأولى');
}

async function recordEvaluation(page: Page) {
  await enterAccount(page, auditorId);
  expect(await readPreviewSession(page)).toMatchObject({ role: 'EMPLOYEE', employeeId: auditorId, name: 'جعفر علي' });
  await gotoPreview(page, '/employee/audit');
  const editor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
  await editor.getByLabel('عدد الأوراق المصححة', { exact: true }).fill('100');
  await page.clock.runFor(500);
  await editor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
  await editor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
  await editor.getByRole('button', { name: 'زيادة أخطاء السلوك', exact: true }).click();
  await expect(editor).toContainText('87 نقطة');
  const state = await readPreviewData(page);
  expect(state.examEvaluations).toHaveLength(1);
  expect(state.examEvaluations[0]).toMatchObject({ employeeId: correctorId, papers: 100, correctionErrors: 2, behaviorErrors: 1, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  expect(state.audit[0]).toMatchObject({ actor: 'جعفر علي', role: 'EMPLOYEE', entity: 'exam-evaluation', employeeId: correctorId, newValues: { behaviorErrors: 1 } });
  const cells = row(card(page, 'Leaderboard الامتحان')).getByRole('cell');
  await expect(cells.nth(2)).toHaveText('100');
  await expect(cells.nth(3)).toHaveText('1');
  await expect(cells.nth(6)).toHaveText('97.00 / 100');
  await expect(cells.nth(7)).toHaveText('87');
}

test.describe('Evaluation roles and archived results', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('explicit seed accounts support admin exams, immediate auditor scores and a readonly corrector view', async ({ page }) => {
    test.setTimeout(90_000);
    await loadExplicitTestData(page);
    const exam = await createCycleAndExam(page);
    expect(exam).toMatchObject({ name: 'امتحان الدورة الأولى', date: '2026-10-03', state: 'OPEN', createdBy: 'مدير النظام' });
    expect((await readPreviewData(page)).audit[0]).toMatchObject({ actor: 'مدير النظام', entity: 'evaluation-exam', action: 'إضافة امتحان للتدقيق' });
    await recordEvaluation(page);

    await enterAccount(page, correctorId);
    await gotoPreview(page, '/employee/evaluation?employee=employee-hiba-mohammed');
    await expect(page.getByRole('heading', { name: 'التقييمات', exact: true })).toBeVisible();
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('87');
    await expect(card(page, 'تفاصيلك حسب الامتحان')).toContainText('100 ورقة · 2 تصحيح · 1 سلوك · 87 نقطة');
    const cycleBoard = card(page, 'Leaderboard الدورة');
    await expect(cycleBoard.locator('tbody tr')).toHaveCount(4);
    await expect(row(cycleBoard).getByRole('cell').nth(6)).toHaveText('97.00 / 100');
    await expect(row(cycleBoard, 'هبة محمد').getByRole('cell').nth(7)).toHaveText('0');
    await expect(page.getByLabel('اختيار امتحان التقييم', { exact: true })).toHaveValue(exam.id);
    await expect(page.getByRole('main').locator('input, textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /زيادة أخطاء|إنقاص أخطاء|إضافة امتحان|إغلاق التدقيق/ })).toHaveCount(0);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toBeVisible();
    }
    await gotoPreview(page, '/employee/audit');
    await expect(page.getByText('واجهة التدقيق مخصصة لموظفي قسم التدقيق', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true })).toHaveCount(0);
    await gotoPreview(page, '/evaluations');
    await expect(page).toHaveURL(/\/employee$/);
  });

  test('closed exams block edits and archived rankings stay fixed while a new cycle starts at zero', async ({ page }) => {
    test.setTimeout(120_000);
    await loadExplicitTestData(page);
    const exam = await createCycleAndExam(page);
    await recordEvaluation(page);
    await enterAccount(page);
    await gotoPreview(page, `/evaluations/${exam.id}`);
    await page.getByRole('button', { name: 'إغلاق التدقيق', exact: true }).click();
    await expect(page.getByRole('button', { name: 'إعادة الفتح', exact: true })).toBeVisible();
    const saved = (await readPreviewData(page)).examEvaluations;
    await enterAccount(page, auditorId);
    await gotoPreview(page, '/employee/audit');
    await expect(page.getByText('هذا الامتحان مغلق للتدقيق.', { exact: false })).toBeVisible();
    const editor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
    await expect(editor.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
    await expect(editor.getByLabel('أخطاء التصحيح', { exact: true })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'زيادة أخطاء السلوك', exact: true })).toBeDisabled();
    expect((await readPreviewData(page)).examEvaluations).toEqual(saved);

    await enterAccount(page);
    await gotoPreview(page, `/evaluations/${exam.id}`);
    await page.getByRole('button', { name: 'إعادة الفتح', exact: true }).click();
    await gotoPreview(page, '/evaluations');
    await page.getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'إغلاق وأرشفة دورة التقييم؟', exact: true });
    await confirmation.getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    await expect(confirmation).toBeHidden();
    const archived = (await readPreviewData(page)).evaluationCycles[0];
    expect(archived.state).toBe('ARCHIVED');
    expect(archived.snapshot!.rows.find(result => result.employeeId === correctorId)).toMatchObject({ score: 87, accuracy: 97, papers: 100, examsEvaluated: 1 });
    expect((await readPreviewData(page)).evaluationExams[0].state).toBe('CLOSED');
    const archive = card(page, 'أرشيف دورات التقييم');
    await archive.locator('summary').click();
    await expect(row(archive).getByRole('cell').nth(7)).toHaveText('87');
    await archive.getByRole('link', { name: 'عرض ترتيب امتحان الدورة الأولى', exact: true }).click();
    await expect(page.getByText('نسخة مؤرشفة ثابتة:', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /إعادة الفتح|إغلاق التدقيق/ })).toHaveCount(0);
    await expect(row(card(page, 'Leaderboard الامتحان')).getByRole('cell').nth(7)).toHaveText('87');

    await gotoPreview(page, '/evaluations');
    await page.getByRole('button', { name: 'فتح دورة تقييم جديدة', exact: true }).click();
    const newBoard = card(page, 'المحصلة النهائية الحالية');
    await expect(newBoard.locator('tbody tr')).toHaveCount(4);
    for (const result of await newBoard.locator('tbody tr').all()) {
      await expect(result.getByRole('cell').nth(7)).toHaveText('0');
      await expect(result.getByRole('cell').nth(3)).toHaveText('0');
    }
    const newExam = await addExam(page, 'امتحان الدورة الثانية');
    await enterAccount(page, auditorId);
    await gotoPreview(page, '/employee/audit');
    await page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true }).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('10');
    await page.clock.runFor(500);
    const after = await readPreviewData(page);
    expect(after.examEvaluations.find(item => item.examId === newExam.id)).toMatchObject({ papers: 10, employeeId: correctorId });
    expect(after.evaluationCycles.find(item => item.id === archived.id)).toEqual(archived);

    await enterAccount(page, correctorId);
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('10');
    await page.getByLabel('اختيار دورة التقييم', { exact: true }).selectOption(archived.id);
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('87');
    await expect(page.getByLabel('اختيار امتحان التقييم', { exact: true })).toHaveValue(exam.id);
    await expect(row(card(page, 'Leaderboard لكل امتحان')).getByRole('cell').nth(6)).toHaveText('97.00 / 100');
  });
});
