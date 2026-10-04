import type { Page } from '@playwright/test';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { test, expect, finishWelcome, gotoPreview, loginPreview, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const firstExam = 'autosave-first';
const secondExam = 'autosave-second';
const closedExam = 'autosave-closed';
const corrector = 'CP-0001';
const correctorName = 'علي محمد حسن';

function evaluationFixture() {
  const data = createPopulatedTestData();
  const timestamp = '2026-09-28T08:00:00.000Z';
  data.evaluationSeasons = [{ id: 'autosave-season', name: 'موسم اختبار الحفظ التلقائي', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationCycles = [{ id: 'autosave-cycle', seasonId: 'autosave-season', name: 'دورة اختبار الحفظ التلقائي', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationExams = [
    { id: firstExam, cycleId: 'autosave-cycle', name: 'الامتحان الأول', date: '2026-09-28', state: 'OPEN', note: '', createdBy: 'مدير النظام', createdAt: timestamp },
    { id: secondExam, cycleId: 'autosave-cycle', name: 'الامتحان الثاني', date: '2026-09-27', state: 'OPEN', note: '', createdBy: 'مدير النظام', createdAt: timestamp },
    { id: closedExam, cycleId: 'autosave-cycle', name: 'الامتحان المغلق', date: '2026-09-26', state: 'CLOSED', note: '', createdBy: 'مدير النظام', createdAt: timestamp, closedBy: 'مدير النظام', closedAt: timestamp },
  ];
  data.examEvaluations = [{ id: 'original-second-evaluation', examId: secondExam, employeeId: corrector, papers: 8, correctionErrors: 1, behaviorErrors: 0, note: '', createdBy: 'مصطفى عمر كريم', updatedBy: 'مصطفى عمر كريم', createdAt: timestamp, updatedAt: timestamp }];
  return data;
}

async function enterAccount(page: Page, account = 'CP-0004') {
  await page.getByLabel('الحساب', { exact: true }).selectOption(account);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/employee$/);
  await page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true }).getByRole('link', { name: 'التدقيق', exact: true }).click();
  await expect(page).toHaveURL(/\/employee\/audit$/);
}

async function startAuditing(page: Page) {
  await seedPopulatedPreview(page, evaluationFixture());
  await gotoPreview(page, '/login');
  await enterAccount(page);
  // Keep debounce timers pending while driving rapid, real input events.
  await page.clock.pauseAt(new Date('2026-09-28T12:00:00.000Z'));
}

function editor(page: Page, name = correctorName) {
  return page.getByRole('article', { name: `تدقيق ${name}`, exact: true });
}

async function currentEvaluation(page: Page, examId = firstExam) {
  return (await readPreviewData(page)).examEvaluations.find(item => item.examId === examId && item.employeeId === corrector);
}

test.describe('Evaluation autosave', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('keeps rapid edits across fields and immediate steppers with accurate audit history', async ({ page }) => {
    await startAuditing(page);
    const card = editor(page);
    const papers = card.getByLabel('عدد الأوراق المصححة', { exact: true });
    await papers.pressSequentially('120');
    await card.getByLabel('أخطاء التصحيح', { exact: true }).pressSequentially('2');
    await card.getByLabel('أخطاء السلوك', { exact: true }).pressSequentially('3');
    await expect(papers).toHaveValue('120');
    await expect(card.getByLabel('أخطاء التصحيح', { exact: true })).toHaveValue('2');
    await expect(card.getByRole('status')).toContainText('جارٍ الحفظ');
    await page.clock.fastForward(451);
    expect(await currentEvaluation(page)).toMatchObject({ papers: 120, correctionErrors: 2, behaviorErrors: 3, updatedBy: 'مصطفى عمر كريم' });
    await expect(card).toContainText('101 نقطة');

    await papers.fill('121');
    await card.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
    expect(await currentEvaluation(page)).toMatchObject({ papers: 121, correctionErrors: 3, behaviorErrors: 3 });
    await expect(card).toContainText('97 نقطة');
    await card.getByRole('button', { name: 'إنقاص أخطاء التصحيح', exact: true }).click();
    expect(await currentEvaluation(page)).toMatchObject({ papers: 121, correctionErrors: 2, behaviorErrors: 3 });
    const state = await readPreviewData(page);
    const saved = state.examEvaluations.find(item => item.examId === firstExam)!;
    const history = state.audit.filter(item => item.entity === 'exam-evaluation');
    expect(history.length).toBeGreaterThanOrEqual(5);
    expect(history.every(item => item.entityId === saved.id && item.actor === 'مصطفى عمر كريم')).toBe(true);
    expect(history[0]).toMatchObject({ oldValues: { correctionErrors: 3 }, newValues: { correctionErrors: 2, examId: firstExam } });
    await expect(card.getByRole('button', { name: /^حفظ/ })).toHaveCount(0);
  });

  test('flushes to the original exam on switching and keeps filtered employee edits separate', async ({ page }) => {
    await startAuditing(page);
    await editor(page).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('42');
    await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption(secondExam);
    await expect(editor(page).getByLabel('عدد الأوراق المصححة', { exact: true })).toHaveValue('8');
    expect(await currentEvaluation(page, firstExam)).toMatchObject({ papers: 42, correctionErrors: null, behaviorErrors: null });
    await editor(page).getByLabel('أخطاء السلوك', { exact: true }).fill('7');
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).click();
    await page.getByRole('checkbox', { name: correctorName, exact: true }).uncheck();
    await expect(editor(page)).toHaveCount(0);
    expect(await currentEvaluation(page, secondExam)).toMatchObject({ papers: 8, correctionErrors: 1, behaviorErrors: 7 });
    await page.getByRole('checkbox', { name: correctorName, exact: true }).check();
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).click();
    await expect(editor(page).getByLabel('أخطاء السلوك', { exact: true })).toHaveValue('7');

    await editor(page, 'مريم أحمد ناصر').getByLabel('عدد الأوراق المصححة', { exact: true }).fill('31');
    await page.getByLabel('البحث في المصححين المختارين', { exact: true }).fill('علي');
    await expect(editor(page, 'مريم أحمد ناصر')).toHaveCount(0);
    await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption(firstExam);
    await expect(editor(page).getByLabel('عدد الأوراق المصححة', { exact: true })).toHaveValue('42');
    await page.clock.fastForward(2000);
    const data = await readPreviewData(page);
    expect(data.examEvaluations.find(item => item.examId === secondExam && item.employeeId === 'CP-0002')).toMatchObject({ papers: 31 });
    expect(data.examEvaluations.some(item => item.examId === firstExam && item.employeeId === 'CP-0002')).toBe(false);
    expect(await currentEvaluation(page, firstExam)).toMatchObject({ papers: 42, behaviorErrors: null });
  });

  test('preserves pending input on internal navigation and a full page reload', async ({ page }) => {
    await startAuditing(page);
    await editor(page).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('61');
    await page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true }).getByRole('link', { name: 'حسابي', exact: true }).click();
    await expect(page).toHaveURL(/\/employee\/profile$/);
    expect(await currentEvaluation(page)).toMatchObject({ papers: 61 });
    await page.getByRole('navigation', { name: 'القائمة الرئيسية', exact: true }).getByRole('link', { name: 'التدقيق', exact: true }).click();
    await expect(editor(page).getByLabel('عدد الأوراق المصححة', { exact: true })).toHaveValue('61');
    await editor(page).getByLabel('أخطاء السلوك', { exact: true }).fill('4');
    // Reload without blurring the input exercises the page lifecycle flush.
    await page.reload();
    await expect(editor(page).getByLabel('أخطاء السلوك', { exact: true })).toHaveValue('4');
    expect(await currentEvaluation(page)).toMatchObject({ papers: 61, behaviorErrors: 4 });
  });

  test('rejects queued writes after logout and attributes new input to the current auditor', async ({ page }) => {
    await startAuditing(page);
    await editor(page).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('777');
    expect(await currentEvaluation(page)).toBeUndefined();
    // Activate logout without a focus change: pending cleanup must reject the
    // old account even when a click did not trigger the input's blur handler.
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).dispatchEvent('click');
    await expect(page).toHaveURL(/\/login$/);
    expect(await currentEvaluation(page)).toBeUndefined();
    await enterAccount(page, 'CP-0005');
    await page.clock.fastForward(2000);
    expect(await currentEvaluation(page)).toBeUndefined();
    await editor(page).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('12');
    await editor(page).getByRole('button', { name: 'زيادة أخطاء السلوك', exact: true }).click();
    expect(await currentEvaluation(page)).toMatchObject({ papers: 12, behaviorErrors: 1, createdBy: 'نور سامي جاسم', updatedBy: 'نور سامي جاسم' });
    const history = (await readPreviewData(page)).audit.filter(item => item.entity === 'exam-evaluation');
    expect(history.every(item => item.actor === 'نور سامي جاسم')).toBe(true);
  });

  test('does not replay pending changes into closed exams or archived cycles', async ({ page }) => {
    await startAuditing(page);
    await editor(page).getByLabel('عدد الأوراق المصححة', { exact: true }).fill('53');
    await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption(closedExam);
    await expect(editor(page).getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
    await expect(editor(page).getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true })).toBeDisabled();
    await page.clock.fastForward(2000);
    expect(await currentEvaluation(page, firstExam)).toMatchObject({ papers: 53 });
    expect(await currentEvaluation(page, closedExam)).toBeUndefined();

    await loginPreview(page);
    await gotoPreview(page, `/evaluations/${firstExam}`);
    await page.getByRole('button', { name: 'إغلاق التدقيق', exact: true }).click();
    const closedRecords = (await readPreviewData(page)).examEvaluations;
    await gotoPreview(page, '/login');
    await enterAccount(page);
    await expect(editor(page).getByLabel('عدد الأوراق المصححة', { exact: true })).toBeDisabled();
    await page.clock.fastForward(2000);
    expect((await readPreviewData(page)).examEvaluations).toEqual(closedRecords);

    await loginPreview(page);
    await gotoPreview(page, '/evaluations');
    await page.getByRole('main').getByRole('link').filter({ has: page.getByRole('heading', { name: 'دورات التقييم', exact: true }) }).click();
    await expect(page).toHaveURL(/\/evaluations\/cycles$/);
    await page.getByRole('button', { name: 'إغلاق الدورة', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'إغلاق وأرشفة الدورة', exact: true }).click();
    const archived = await readPreviewData(page);
    expect(archived.evaluationCycles[0].state).toBe('ARCHIVED');
    await gotoPreview(page, '/login');
    await enterAccount(page);
    await expect(page.getByRole('heading', { name: 'لا توجد دورة تقييم مفتوحة', exact: true })).toBeVisible();
    await page.clock.fastForward(2000);
    const after = await readPreviewData(page);
    expect(after.examEvaluations).toEqual(archived.examEvaluations);
    expect(after.evaluationCycles[0].snapshot).toEqual(archived.evaluationCycles[0].snapshot);
  });
});
