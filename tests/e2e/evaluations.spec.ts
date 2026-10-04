import type { Locator, Page } from '@playwright/test';
import { test, expect, finishWelcome, gotoPreview, readPreviewData, readPreviewSession, seedPopulatedPreview } from './helpers/preview';
import { createTestData } from '../../src/lib/mock-data';

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
  await page.getByRole('button', { name: 'تحميل بيانات الاختبار', exact: true }).click();
  await expect(page.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(8);
  const state = await readPreviewData(page);
  expect(state.employees.map(employee => employee.name)).toEqual(['ابرار حقي', 'هبة محمد', 'فاطمة فراس', 'مريم عصام', 'جعفر علي', 'مريم فهد', 'دانيا اياد']);
  expect(state.evaluationSeasons).toEqual([]);
  expect(state.evaluationCycles).toEqual([]);
  expect(state.evaluationExams).toEqual([]);
  expect(state.examEvaluations).toEqual([]);
  expect(state.attendance.filter(item => item.employeeId === 'employee-dania-iyad' && item.status === 'PRESENT')).toHaveLength(18);
  await enterAccount(page);
}

function card(page: Page, title: string) {
  return page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

function row(container: Locator, name = 'ابرار حقي') {
  return container.getByRole('row').filter({ hasText: name });
}

async function openSeasonAndCycle(page: Page) {
  await gotoPreview(page, '/evaluations');
  await page.getByRole('button', { name: 'فتح موسم جديد', exact: true }).first().click();
  const seasonDialog = page.getByRole('dialog', { name: 'فتح موسم جديد', exact: true });
  await seasonDialog.getByLabel('اسم الموسم', { exact: false }).fill('موسم الاختبار');
  await seasonDialog.getByLabel('تاريخ بداية الموسم', { exact: false }).fill('2026-09-01');
  await seasonDialog.getByRole('button', { name: 'فتح الموسم', exact: true }).click();
  await expect(seasonDialog).toBeHidden();
  await page.getByRole('button', { name: 'فتح دورة تقييم', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'إغلاق الموسم', exact: true })).toHaveCount(0);
  const state = await readPreviewData(page);
  expect(state.evaluationSeasons).toHaveLength(1);
  expect(state.evaluationCycles).toHaveLength(1);
  expect(state.evaluationCycles[0].seasonId).toBe(state.evaluationSeasons[0].id);
}

async function addExam(page: Page, name: string) {
  await page.getByRole('button', { name: 'إضافة امتحان', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'إضافة امتحان', exact: true });
  await dialog.getByLabel('اسم الامتحان', { exact: false }).fill(name);
  await dialog.getByLabel('تاريخ الامتحان', { exact: false }).fill('2026-09-18');
  await dialog.getByRole('button', { name: 'إضافة وفتح للتدقيق', exact: true }).click();
  await expect(dialog).toBeHidden();
  return (await readPreviewData(page)).evaluationExams.find(exam => exam.name === name)!;
}

async function recordEvaluation(page: Page, papers = 100) {
  await enterAccount(page, auditorId);
  expect(await readPreviewSession(page)).toMatchObject({ role: 'EMPLOYEE', employeeId: auditorId, name: 'جعفر علي' });
  await gotoPreview(page, '/employee/audit');
  const editor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
  await editor.getByLabel('عدد الأوراق المصححة', { exact: true }).fill(String(papers));
  await page.clock.runFor(500);
  await editor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
  await editor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
  await editor.getByRole('button', { name: 'زيادة أخطاء السلوك', exact: true }).click();
  await expect(editor).toContainText(`${papers - 13} نقطة`);
  const state = await readPreviewData(page);
  expect(state.examEvaluations.at(-1)).toMatchObject({ employeeId: correctorId, papers, correctionErrors: 2, behaviorErrors: 1, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  expect(state.audit[0]).toMatchObject({ actor: 'جعفر علي', role: 'EMPLOYEE', entity: 'exam-evaluation', employeeId: correctorId, newValues: { behaviorErrors: 1 } });
  const cells = row(card(page, 'Leaderboard الامتحان')).getByRole('cell');
  await expect(cells.nth(2)).toHaveText(String(papers));
  await expect(cells.nth(7)).toHaveText(String(papers - 13));
  if (papers === 100) await expect(cells.nth(6)).toHaveText('97.00 / 100');
}

async function closeExamAsAdmin(page: Page, examId: string) {
  await enterAccount(page);
  await gotoPreview(page, `/evaluations/${examId}`);
  await page.getByRole('button', { name: 'إغلاق التدقيق', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إعادة الفتح', exact: true })).toBeVisible();
}

test.describe('Evaluation seasons, publishing and roles', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('open exam stays private to corrector until admin closes it, then season totals publish', async ({ page }) => {
    test.setTimeout(120_000);
    await loadExplicitTestData(page);
    await openSeasonAndCycle(page);
    const exam = await addExam(page, 'امتحان الدورة الأولى');
    await recordEvaluation(page, 513);

    await enterAccount(page);
    await gotoPreview(page, '/evaluations');
    await expect(row(card(page, 'Leaderboard الموسم')).getByRole('cell').nth(3)).toHaveText('500');

    await enterAccount(page, correctorId);
    const homeSeason = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
    await expect(homeSeason).toContainText('0 pts');
    await expect(homeSeason.getByRole('heading', { name: 'Bronze 1', exact: true })).toBeVisible();
    await expect(homeSeason.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await gotoPreview(page, '/employee/evaluation');
    await expect(card(page, 'تفاصيل الامتحانات')).toContainText('قيد التدقيق');
    await expect(card(page, 'تفاصيل الامتحانات')).not.toContainText(/513 ورقة|2 تصحيح|1 سلوك|500 نقطة/);
    await expect(card(page, 'Leaderboard الامتحان')).toContainText('قيد التدقيق');
    await expect(card(page, 'Leaderboard الامتحان').getByRole('table')).toHaveCount(0);
    await expect(row(card(page, 'Leaderboard الدورة')).getByRole('cell').nth(7)).toHaveText('0');
    await expect(row(card(page, 'Leaderboard الموسم')).getByRole('cell').nth(3)).toHaveText('0');
    await expect(page.getByText('500 pts', { exact: true })).toHaveCount(0);
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('0');
    await expect(page.getByRole('main').locator('input, textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /زيادة أخطاء|إضافة امتحان|إغلاق التدقيق/ })).toHaveCount(0);

    await closeExamAsAdmin(page, exam.id);
    await enterAccount(page, correctorId);
    await expect(homeSeason).toContainText('500 pts');
    await expect(homeSeason.getByRole('heading', { name: 'Bronze 2', exact: true })).toBeVisible();
    await expect(homeSeason.getByText('متوسط اليوم', { exact: true }).locator('..').locator('strong')).toHaveText('32.1 ورقة/يوم');
    await expect(homeSeason.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'متبقي 500 نقطة');
    await gotoPreview(page, '/employee/evaluation');
    await expect(card(page, 'تفاصيل الامتحانات')).toContainText('513 ورقة · 2 تصحيح · 1 سلوك · 500 نقطة');
    await expect(page.getByText('500 pts', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('500');
    await expect(row(card(page, 'Leaderboard الامتحان')).getByRole('cell').nth(6)).toHaveText('99.42 / 100');
    await expect(page.getByText('أيام الحضور', { exact: true }).first().locator('..').locator('strong')).toHaveText('16');

    await enterAccount(page, auditorId);
    await gotoPreview(page, '/employee/audit');
    const closedEditor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
    await expect(closedEditor.getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
    await expect(closedEditor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true })).toBeDisabled();
    await enterAccount(page);
    await gotoPreview(page, `/evaluations/${exam.id}`);
    await page.getByRole('button', { name: 'إعادة الفتح', exact: true }).click();
    await enterAccount(page, correctorId);
    await expect(homeSeason).toContainText('0 pts');
    await expect(homeSeason.getByRole('heading', { name: 'Bronze 1', exact: true })).toBeVisible();
    await gotoPreview(page, '/employee/evaluation');
    await expect(card(page, 'تفاصيل الامتحانات')).not.toContainText('500 نقطة');
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('0');
  });

  test('season keeps accumulating across archived cycles and archives independently', async ({ page }) => {
    test.setTimeout(150_000);
    await loadExplicitTestData(page);
    await openSeasonAndCycle(page);
    const firstExam = await addExam(page, 'امتحان الدورة الأولى');
    await recordEvaluation(page, 100);
    await closeExamAsAdmin(page, firstExam.id);

    await gotoPreview(page, '/evaluations');
    await page.getByRole('button', { name: 'إغلاق الدورة', exact: true }).click();
    const closeCycle = page.getByRole('dialog', { name: 'إغلاق وأرشفة دورة التقييم؟', exact: true });
    await closeCycle.getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    await expect(closeCycle).toBeHidden();
    const archivedCycle = (await readPreviewData(page)).evaluationCycles[0];
    await page.getByRole('button', { name: 'فتح دورة تقييم', exact: true }).first().click();
    const secondExam = await addExam(page, 'امتحان الدورة الثانية');

    await enterAccount(page, auditorId);
    await gotoPreview(page, '/employee/audit');
    const editor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
    await editor.getByLabel('عدد الأوراق المصححة', { exact: true }).fill('20');
    await page.clock.runFor(500);

    await enterAccount(page);
    await gotoPreview(page, '/evaluations');
    const seasonBoard = card(page, 'Leaderboard الموسم');
    await expect(row(seasonBoard).getByRole('cell').nth(3)).toHaveText('107');

    await enterAccount(page, correctorId);
    await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toContainText('87 pts');
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByText('87 pts', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('0');
    await closeExamAsAdmin(page, secondExam.id);
    await enterAccount(page, correctorId);
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByText('107 pts', { exact: true }).first()).toBeVisible();

    await enterAccount(page);
    await gotoPreview(page, '/evaluations');
    await page.getByRole('button', { name: 'إغلاق الدورة', exact: true }).click();
    await page.getByRole('dialog', { name: 'إغلاق وأرشفة دورة التقييم؟', exact: true }).getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    await page.getByRole('button', { name: 'إغلاق الموسم', exact: true }).click();
    await page.getByRole('dialog', { name: 'إغلاق وأرشفة الموسم؟', exact: true }).getByRole('button', { name: 'إغلاق وأرشفة الموسم', exact: true }).click();
    const archived = (await readPreviewData(page)).evaluationSeasons[0];
    expect(archived.state).toBe('ARCHIVED');
    expect(archived.endDate).toBe('2026-09-28');
    expect(archived.snapshot?.rows.find(item => item.employeeId === correctorId)).toMatchObject({ score: 107, papers: 120, examsEvaluated: 2, cyclesEvaluated: 2, attendanceDays: 16, averagePapersPerDay: 7.5, accuracy: 97.5 });
    expect(archived.snapshot?.cycleIds).toHaveLength(2);
    expect((await readPreviewData(page)).evaluationCycles.find(item => item.id === archivedCycle.id)).toEqual(archivedCycle);

    await page.getByRole('button', { name: 'فتح موسم جديد', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'فتح موسم جديد', exact: true });
    await dialog.getByLabel('اسم الموسم', { exact: false }).fill('الموسم الجديد');
    await dialog.getByRole('button', { name: 'فتح الموسم', exact: true }).click();
    await expect(row(card(page, 'Leaderboard الموسم')).getByRole('cell').nth(3)).toHaveText('0');
    expect((await readPreviewData(page)).evaluationSeasons.find(item => item.id === archived.id)).toEqual(archived);

    await enterAccount(page, correctorId);
    await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toContainText('0 pts');
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByLabel('اختيار دورة التقييم', { exact: true })).toHaveCount(0);
    await expect(page.getByText('لا توجد دورات في هذا الموسم', { exact: true })).toBeVisible();
    await page.getByLabel('اختيار الموسم', { exact: true }).selectOption(archived.id);
    await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toContainText('107 pts');
    await expect(page.getByLabel('اختيار دورة التقييم', { exact: true }).locator('option')).toHaveCount(2);
    await page.getByLabel('اختيار دورة التقييم', { exact: true }).selectOption(archivedCycle.id);
    await expect(card(page, 'تفاصيل الامتحانات')).toContainText('87 نقطة');
    await expect(card(page, 'تفاصيل الامتحانات')).not.toContainText('امتحان الدورة الثانية');
    await expect(row(card(page, 'Leaderboard الموسم')).getByRole('cell').nth(8)).toHaveText('7.5 ورقة/يوم');
  });

  test('legacy archived cycles remain reviewable without inventing a season or leaking into the new season', async ({ page }) => {
    const fixture = createTestData();
    const timestamp = '2026-09-20T12:00:00.000Z';
    fixture.evaluationCycles.push({ id: 'legacy-cycle', name: 'دورة قديمة محفوظة', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
    fixture.evaluationExams.push({ id: 'legacy-exam', cycleId: 'legacy-cycle', name: 'امتحان محفوظ قبل المواسم', date: '2026-09-18', note: '', state: 'CLOSED', createdBy: 'مدير النظام', createdAt: timestamp, closedBy: 'مدير النظام', closedAt: timestamp });
    fixture.examEvaluations.push({ id: 'legacy-evaluation', examId: 'legacy-exam', employeeId: correctorId, papers: 50, correctionErrors: 1, behaviorErrors: 2, note: '', createdBy: 'جعفر علي', createdAt: timestamp, updatedBy: 'جعفر علي', updatedAt: timestamp });
    await seedPopulatedPreview(page, fixture);
    await enterAccount(page);
    await gotoPreview(page, '/evaluations');
    await expect(page.getByText('دورة سابقة بلا موسم', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'تفاصيل الامتحان', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'إغلاق الدورة', exact: true }).click();
    await page.getByRole('dialog', { name: 'إغلاق وأرشفة دورة التقييم؟', exact: true }).getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    const archivedCycle = (await readPreviewData(page)).evaluationCycles[0];
    expect(archivedCycle.state).toBe('ARCHIVED');
    expect(archivedCycle.snapshot?.rows.find(item => item.employeeId === correctorId)?.score).toBe(39);
    expect((await readPreviewData(page)).evaluationSeasons).toEqual([]);
    await page.getByRole('button', { name: 'فتح موسم جديد', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'فتح موسم جديد', exact: true });
    await dialog.getByLabel('اسم الموسم', { exact: false }).fill('الموسم الحالي');
    await dialog.getByLabel('تاريخ بداية الموسم', { exact: false }).fill('2026-09-21');
    await dialog.getByRole('button', { name: 'فتح الموسم', exact: true }).click();
    await expect(dialog).toBeHidden();
    const currentSeasonId = (await readPreviewData(page)).evaluationSeasons[0].id;
    await enterAccount(page, correctorId);
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByLabel('اختيار الموسم', { exact: true })).toHaveValue(currentSeasonId);
    await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toContainText('0 pts');
    await expect(page.getByLabel('اختيار دورة التقييم', { exact: true })).toHaveCount(0);
    await page.getByLabel('اختيار الموسم', { exact: true }).selectOption({ label: 'دورات سابقة بلا موسم' });
    await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('اختيار دورة التقييم', { exact: true })).toHaveValue('legacy-cycle');
    await expect(page.getByText('التقييم النهائي', { exact: true }).locator('..').locator('strong')).toHaveText('39');
    await expect(card(page, 'تفاصيل الامتحانات')).toContainText('50 ورقة · 1 تصحيح · 2 سلوك · 39 نقطة');
    expect((await readPreviewData(page)).evaluationCycles[0]).toEqual(archivedCycle);
    expect((await readPreviewData(page)).evaluationCycles[0].seasonId).toBeUndefined();
  });
});
