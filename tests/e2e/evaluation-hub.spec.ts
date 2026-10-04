import type { Page } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from '../../src/lib/evaluations';
import { test, expect, gotoPreview, loginPreview, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const correctorId = 'employee-abrar-haqi';
const timestamp = '2026-09-28T08:00:00.000Z';

function historicalHubFixture() {
  const data = createTestData();
  data.evaluationSeasons = [
    { id: 'season-old', name: 'الموسم السابق', startDate: '2026-09-01', endDate: '2026-09-19', state: 'OPEN', openedAt: '2026-09-01T08:00:00.000Z', openedBy: 'مدير النظام' },
  ];
  data.evaluationCycles = [
    { id: 'cycle-old', seasonId: 'season-old', name: 'دورة الموسم السابق', state: 'OPEN', openedAt: '2026-09-01T08:00:00.000Z', openedBy: 'مدير النظام' },
    { id: 'cycle-legacy', name: 'دورة محفوظة بلا موسم', state: 'OPEN', openedAt: '2026-08-01T08:00:00.000Z', openedBy: 'مدير النظام' },
  ];
  function addExam(id: string, cycleId: string, name: string, date: string, state: 'OPEN' | 'CLOSED', papers: number) {
    data.evaluationExams.push({ id, cycleId, name, date, state, note: '', createdAt: timestamp, createdBy: 'مدير النظام', ...(state === 'CLOSED' ? { closedAt: timestamp, closedBy: 'مدير النظام' } : {}) });
    data.examEvaluations.push({ id: `result-${id}`, examId: id, employeeId: correctorId, papers, correctionErrors: 1, behaviorErrors: 2, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  }
  function archiveCycle(id: string, closedAt: string) {
    const cycle = data.evaluationCycles.find(item => item.id === id)!;
    cycle.snapshot = buildEvaluationCycleSnapshot(data, cycle.id);
    cycle.state = 'ARCHIVED';
    cycle.closedAt = closedAt;
    cycle.closedBy = 'مدير النظام';
  }
  addExam('exam-old', 'cycle-old', 'امتحان الموسم السابق', '2026-09-18', 'CLOSED', 50);
  addExam('exam-legacy', 'cycle-legacy', 'امتحان قديم بلا موسم', '2026-08-18', 'CLOSED', 30);
  archiveCycle('cycle-legacy', '2026-08-19T08:00:00.000Z');
  archiveCycle('cycle-old', '2026-09-19T08:00:00.000Z');
  const previous = data.evaluationSeasons[0];
  previous.snapshot = buildEvaluationSeasonSnapshot(data, previous.id);
  previous.state = 'ARCHIVED';
  previous.closedAt = '2026-09-19T08:00:00.000Z';
  previous.closedBy = 'مدير النظام';
  // Finish the historical season before starting the current season or cycle.
  data.evaluationSeasons.push({ id: 'season-current', name: 'الموسم الحالي', startDate: '2026-09-20', state: 'OPEN', openedAt: '2026-09-20T08:00:00.000Z', openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'cycle-current-archived', seasonId: 'season-current', name: 'الدورة السابقة في الموسم الحالي', state: 'OPEN', openedAt: '2026-09-20T08:00:00.000Z', openedBy: 'مدير النظام' });
  addExam('exam-current-archived', 'cycle-current-archived', 'امتحان الدورة السابقة', '2026-09-22', 'CLOSED', 70);
  archiveCycle('cycle-current-archived', '2026-09-23T08:00:00.000Z');
  data.evaluationCycles.push({ id: 'cycle-current', seasonId: 'season-current', name: 'الدورة الحالية', state: 'OPEN', openedAt: '2026-09-25T08:00:00.000Z', openedBy: 'مدير النظام' });
  addExam('exam-published', 'cycle-current', 'امتحان منشور حالي', '2026-09-26', 'CLOSED', 80);
  addExam('exam-open', 'cycle-current', 'امتحان مفتوح حالي', '2026-09-28', 'OPEN', 90);
  // Historical displays must use their frozen metadata, not the current label.
  data.evaluationExams.find(item => item.id === 'exam-old')!.name = 'اسم حالي لا يمثل الأرشيف';
  return data;
}

function hubCard(page: Page, title: string) {
  return page.getByRole('main').getByRole('link').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

async function expectHub(page: Page, counts: { seasons: number; cycles: number; exams: number; open: number }) {
  await expect(page.getByRole('heading', { name: 'التدقيق', level: 1, exact: true })).toBeVisible();
  for (const [title, count, href] of [
    ['المواسم', counts.seasons, '/evaluations/seasons'],
    ['دورات التقييم', counts.cycles, '/evaluations/cycles'],
    ['الامتحانات', counts.exams, '/evaluations/exams'],
  ] as const) {
    await expect(hubCard(page, title)).toHaveAttribute('href', href);
    await expect(hubCard(page, title).locator('strong').first()).toHaveText(String(count));
  }
  await expect(page.getByText('الامتحانات المفتوحة', { exact: true }).locator('..').locator('strong')).toHaveText(String(counts.open));
}

test.describe('Evaluation admin hub navigation', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('empty hub cards guide prerequisites and every management header returns to the hub', async ({ page }) => {
    await loginPreview(page);
    await gotoPreview(page, '/evaluations');
    await expectHub(page, { seasons: 0, cycles: 0, exams: 0, open: 0 });
    await hubCard(page, 'الامتحانات').click();
    await expect(page).toHaveURL(/\/evaluations\/exams$/);
    await expect(page.getByRole('heading', { name: 'لا توجد دورة تقييم مفتوحة', exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'دورات التقييم', exact: true }).click();
    await expect(page).toHaveURL(/\/evaluations\/cycles$/);
    await expect(page.getByRole('button', { name: 'فتح دورة', exact: true })).toBeDisabled();
    await page.getByRole('main').getByRole('link', { name: 'المواسم', exact: true }).click();
    await expect(page).toHaveURL(/\/evaluations\/seasons$/);
    await expect(page.getByRole('button', { name: 'فتح موسم', exact: true })).toBeEnabled();
    for (const title of ['الامتحانات', 'دورات التقييم', 'المواسم']) {
      await page.getByRole('main').getByRole('link', { name: 'التدقيق', exact: true }).click();
      await expectHub(page, { seasons: 0, cycles: 0, exams: 0, open: 0 });
      await hubCard(page, title).click();
      await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    }
    expect((await readPreviewData(page)).evaluationSeasons).toEqual([]);
    expect((await readPreviewData(page)).evaluationCycles).toEqual([]);
  });

  test('season and cycle drilldowns preserve historical context while live exam counts update', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = historicalHubFixture();
    await seedPopulatedPreview(page, fixture);
    await loginPreview(page);
    await gotoPreview(page, '/evaluations');
    await expectHub(page, { seasons: 2, cycles: 4, exams: 2, open: 1 });
    await expect(hubCard(page, 'المواسم')).toContainText('الموسم الحالي');
    await expect(hubCard(page, 'دورات التقييم')).toContainText('الدورة الحالية');
    await hubCard(page, 'المواسم').click();
    await page.locator('summary').filter({ hasText: 'الموسم السابق' }).click();
    await page.getByRole('link', { name: 'عرض دورات الموسم السابق', exact: true }).click();
    await expect(page).toHaveURL(/\/evaluations\/cycles\?season=season-old$/);
    await expect(page.getByLabel('اختيار الموسم', { exact: true })).toHaveValue('season-old');
    await expect(page.locator('summary')).toHaveCount(1);
    await expect(page.locator('summary')).toContainText('دورة الموسم السابق');
    await page.locator('summary').click();
    await page.getByRole('link', { name: 'عرض امتحانات دورة الموسم السابق', exact: true }).click();
    await expect(page).toHaveURL(/\/evaluations\/exams\?cycle=cycle-old$/);
    const cycleFilter = page.getByLabel('اختيار دورة التقييم', { exact: true });
    await expect(cycleFilter).toHaveValue('cycle-old');
    await expect(page.getByRole('heading', { name: 'امتحان الموسم السابق', exact: true })).toBeVisible();
    await expect(page.getByText('اسم حالي لا يمثل الأرشيف', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إضافة امتحان', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'التفاصيل', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'امتحان الموسم السابق', level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /إعادة الفتح|إغلاق التدقيق/ })).toHaveCount(0);
    const back = page.getByRole('main').getByRole('link', { name: 'العودة إلى الامتحانات', exact: true });
    await expect(back).toHaveAttribute('href', '/evaluations/exams?cycle=cycle-old');
    await back.click();
    await expect(cycleFilter).toHaveValue('cycle-old');

    await cycleFilter.selectOption('cycle-current');
    await expect(page.getByRole('heading', { name: 'امتحان الموسم السابق', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إضافة امتحان', exact: true })).toBeEnabled();
    const currentExam = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'امتحان مفتوح حالي', exact: true }) });
    await currentExam.getByRole('link', { name: 'التفاصيل', exact: true }).click();
    await page.getByRole('button', { name: 'إغلاق التدقيق', exact: true }).click();
    await expect(page.getByRole('button', { name: 'إعادة الفتح', exact: true })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'العودة إلى الامتحانات', exact: true }).click();
    await expect(cycleFilter).toHaveValue('cycle-current');
    await page.getByRole('main').getByRole('link', { name: 'التدقيق', exact: true }).click();
    await expectHub(page, { seasons: 2, cycles: 4, exams: 2, open: 0 });

    await hubCard(page, 'دورات التقييم').click();
    await page.getByLabel('اختيار الموسم', { exact: true }).selectOption('season-current');
    await expect(page.locator('summary')).toHaveCount(1);
    await expect(page.locator('summary')).toContainText('الدورة السابقة في الموسم الحالي');
    await page.getByLabel('اختيار الموسم', { exact: true }).selectOption({ label: 'دورات سابقة بلا موسم' });
    await expect(page.locator('summary')).toHaveCount(1);
    await expect(page.locator('summary')).toContainText('دورة محفوظة بلا موسم');
    await page.locator('summary').click();
    await page.getByRole('link', { name: 'عرض امتحانات دورة محفوظة بلا موسم', exact: true }).click();
    await expect(cycleFilter).toHaveValue('cycle-legacy');
    await expect(page.getByRole('heading', { name: 'امتحان قديم بلا موسم', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة امتحان', exact: true })).toHaveCount(0);
    const after = await readPreviewData(page);
    expect(after.evaluationSeasons).toEqual(fixture.evaluationSeasons);
    expect(after.evaluationCycles).toEqual(fixture.evaluationCycles);
    expect(after.examEvaluations).toEqual(fixture.examEvaluations);
    expect(after.evaluationExams.find(item => item.id === 'exam-old')).toEqual(fixture.evaluationExams.find(item => item.id === 'exam-old'));
    expect(after.evaluationExams.find(item => item.id === 'exam-open')?.state).toBe('CLOSED');
  });
});
