import type { Locator, Page } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from '../../src/lib/evaluations';
import { test, expect, finishWelcome, gotoPreview, seedPopulatedPreview } from './helpers/preview';

const correctorId = 'employee-abrar-haqi';
const auditorId = 'employee-jaafar-ali';
const timestamp = '2026-09-01T09:00:00.000Z';

function rankScenario() {
  const data = createTestData();
  data.evaluationSeasons.push({ id: 'rank-season', name: 'موسم ملف الموظف', state: 'OPEN', startDate: '2026-09-01', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'rank-cycle', seasonId: 'rank-season', name: 'دورة ملف الموظف', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  for (const [id, state, papers] of [['rank-closed-exam', 'CLOSED', 263], ['rank-open-exam', 'OPEN', 613]] as const) {
    data.evaluationExams.push({ id, cycleId: 'rank-cycle', name: id === 'rank-closed-exam' ? 'امتحان منشور' : 'امتحان قيد التدقيق', date: '2026-09-18', state, note: '', createdAt: timestamp, createdBy: 'مدير النظام' });
    data.examEvaluations.push({ id: `evaluation-${id}`, examId: id, employeeId: correctorId, papers, correctionErrors: 2, behaviorErrors: 1, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  }
  data.examEvaluations.push({ id: 'evaluation-second-corrector', examId: 'rank-closed-exam', employeeId: 'employee-hiba-mohammed', papers: 800, correctionErrors: 0, behaviorErrors: 0, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  return data;
}

function archivedScenario() {
  const data = rankScenario();
  for (const exam of data.evaluationExams) exam.state = 'CLOSED';
  const cycle = data.evaluationCycles[0];
  cycle.snapshot = buildEvaluationCycleSnapshot(data, cycle.id);
  cycle.state = 'ARCHIVED';
  cycle.closedAt = '2026-09-20T16:00:00.000Z';
  cycle.closedBy = 'مدير النظام';
  const season = data.evaluationSeasons[0];
  season.endDate = '2026-09-20';
  season.snapshot = buildEvaluationSeasonSnapshot(data, season.id);
  season.state = 'ARCHIVED';
  season.closedAt = cycle.closedAt;
  season.closedBy = 'مدير النظام';
  data.evaluationSeasons.unshift({ id: 'older-season', name: 'موسم أقدم', startDate: '2026-08-01', endDate: '2026-08-31', state: 'ARCHIVED', openedAt: '2026-08-01T09:00:00.000Z', openedBy: 'مدير النظام', closedAt: '2026-08-31T16:00:00.000Z', closedBy: 'مدير النظام', snapshot: { rows: [], cycleIds: [] } });
  return data;
}

async function enterAccount(page: Page, id = 'SYSTEM') {
  await gotoPreview(page, '/login?switch=1');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول', exact: true })).toBeEnabled();
  await page.getByLabel('الحساب', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(id === 'SYSTEM' ? /\/dashboard$/ : /\/employee$/);
}

function profileRank(page: Page) {
  return page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'التقييم الموسمي', exact: true }) });
}

function metric(container: Locator, label: string) {
  return container.getByText(label, { exact: true }).locator('..').locator('strong');
}

test.use({ viewport: { width: 1366, height: 900 } });

test('admin profile rank includes live scores while the corrector rank and place use published exams only', async ({ page }) => {
  await seedPopulatedPreview(page, rankScenario());
  await enterAccount(page);
  await gotoPreview(page, `/employees/${correctorId}`);
  const profile = profileRank(page);
  await expect(profile).toBeVisible();
  await expect(profile.getByText('850 pts', { exact: true })).toBeVisible();
  await expect(profile.locator('[data-rank-tier] img')).toHaveAttribute('src', '/ranks/bronze-2.png');
  await expect(profile.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
  await expect(profile.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'متبقي 150 نقطة');
  for (const [label, value] of [['الترتيب', '#1'], ['الأوراق', '876'], ['الامتحانات', '2'], ['الدورات', '1'], ['أيام الحضور', '16'], ['متوسط اليوم', '54.8'], ['أخطاء التصحيح', '4'], ['أخطاء السلوك', '2'], ['معدل الدقة', '99.32 / 100']]) {
    await expect(metric(profile, label)).toHaveText(value);
  }
  await expect(profile.getByRole('link', { name: 'Leaderboard الموسم', exact: true })).toHaveAttribute('href', '/evaluations/seasons');

  await enterAccount(page, correctorId);
  const home = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
  await expect(home.getByText('250 pts', { exact: true })).toBeVisible();
  await expect(home.locator('[data-rank-tier] img')).toHaveAttribute('src', '/ranks/bronze-1.png');
  await expect(home.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(metric(home, 'الترتيب')).toHaveText('#2');
  await expect(metric(home, 'الامتحانات')).toHaveText('1');
  await expect(home).not.toContainText('850 pts');
  await gotoPreview(page, `/employees/${correctorId}`);
  await expect(page).toHaveURL(/\/employee$/);
  await expect(profileRank(page)).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('850 pts');
});

test('auditors never receive corrector rank cards on their profile or home', async ({ page }) => {
  await seedPopulatedPreview(page, rankScenario());
  await enterAccount(page);
  await gotoPreview(page, `/employees/${auditorId}`);
  await expect(page.getByRole('heading', { name: 'جعفر علي', exact: true })).toBeVisible();
  await expect(profileRank(page)).toHaveCount(0);
  await expect(page.locator('main [data-rank-tier]')).toHaveCount(0);
  await enterAccount(page, auditorId);
  await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toHaveCount(0);
  await expect(page.locator('main [data-rank-tier]')).toHaveCount(0);
});

test('latest archived rank uses its frozen row and links to that specific seasonal archive', async ({ page }) => {
  await seedPopulatedPreview(page, archivedScenario());
  await enterAccount(page);
  await gotoPreview(page, `/employees/${correctorId}`);
  const profile = profileRank(page);
  await expect(profile).toContainText('موسم ملف الموظف');
  await expect(profile).not.toContainText('موسم أقدم');
  await expect(profile.getByText('850 pts', { exact: true })).toBeVisible();
  const leaderboardLink = profile.getByRole('link', { name: 'Leaderboard الموسم', exact: true });
  await expect(leaderboardLink).toHaveAttribute('href', '/evaluations/seasons?season=rank-season#season-rank-season');
  await leaderboardLink.click();
  await expect(page.locator('details#season-rank-season')).toHaveAttribute('open', '');
  await enterAccount(page, correctorId);
  const home = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
  await expect(home).toContainText('موسم ملف الموظف');
  await expect(home.getByText('850 pts', { exact: true })).toBeVisible();
});

test('correctors absent from an archived snapshot do not receive an invented zero-point rank', async ({ page }) => {
  const data = archivedScenario();
  data.employees.push({ ...data.employees[0], id: 'new-corrector', code: 'CP-0008', name: 'مصحح بعد الموسم', username: 'AFTER-SEASON', startDate: '2026-09-28', createdAt: '2026-09-28T10:00:00.000Z' });
  await seedPopulatedPreview(page, data);
  await enterAccount(page);
  await gotoPreview(page, '/employees/new-corrector');
  await expect(page.getByRole('heading', { name: 'مصحح بعد الموسم', exact: true })).toBeVisible();
  await expect(profileRank(page)).toHaveCount(0);
  await enterAccount(page, 'new-corrector');
  await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toHaveCount(0);
  await expect(page.locator('main [data-rank-tier]')).toHaveCount(0);
});

test('legacy seasonless cycles do not fabricate a season or a profile rank', async ({ page }) => {
  const data = rankScenario();
  data.evaluationSeasons = [];
  delete data.evaluationCycles[0].seasonId;
  await seedPopulatedPreview(page, data);
  await enterAccount(page);
  await gotoPreview(page, `/employees/${correctorId}`);
  await expect(page.getByRole('heading', { name: 'ابرار حقي', exact: true })).toBeVisible();
  await expect(profileRank(page)).toHaveCount(0);
  await enterAccount(page, correctorId);
  await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true })).toHaveCount(0);
});
