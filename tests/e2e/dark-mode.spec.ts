import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { test, expect, finishWelcome, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

function darkModeScenario() {
  const data = createPopulatedTestData();
  const timestamp = '2026-09-01T10:00:00.000Z';
  data.evaluationSeasons.push({ id: 'dark-season', name: 'الموسم الدراسي الأول', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'dark-cycle', seasonId: 'dark-season', name: 'دورة المتابعة الأولى', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  for (const [id, state] of [['dark-closed-exam', 'CLOSED'], ['dark-open-exam', 'OPEN']] as const) {
    data.evaluationExams.push({ id, cycleId: 'dark-cycle', name: state === 'CLOSED' ? 'امتحان النتائج المنشورة' : 'امتحان التدقيق الحالي', date: '2026-09-20', note: '', state, createdAt: timestamp, createdBy: 'مدير النظام' });
    data.examEvaluations.push({ id: `result-${id}`, examId: id, employeeId: 'CP-0001', papers: 3300, correctionErrors: 20, behaviorErrors: 0, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'مصطفى عمر كريم', updatedBy: 'مصطفى عمر كريم' });
  }
  return data;
}

async function darkAndFits(page: Page, width: number) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
}

async function expectSeasonRankLayout(page: Page, width: number, description: string, animated = false) {
  const badges = page.locator('main [data-rank-tier]:visible');
  await expect(badges.first()).toBeVisible();
  if (animated) await expect(page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true }).locator('[data-rank-shine]')).toHaveCount(1);
  for (const badge of await badges.all()) {
    const tier = await badge.getAttribute('data-rank-tier');
    const level = await badge.getAttribute('data-rank-level');
    const asset = tier === 'grandmaster' ? '/ranks/grandmaster.png' : `/ranks/${tier}-${level}.png`;
    const image = badge.locator('img');
    await expect(image).toHaveAttribute('src', asset);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0 && element.naturalHeight > 0), { message: `${asset}: dark rank image loads successfully` }).toBe(true);
    await expect(badge.locator('svg, canvas')).toHaveCount(0);
    const shine = badge.locator('[data-rank-shine]');
    if (await shine.count()) {
      expect(await shine.evaluate(element => getComputedStyle(element).maskImage)).toContain(asset);
      await expect(shine).toHaveCSS('mask-size', 'contain');
      await expect(shine).toHaveCSS('mask-repeat', 'no-repeat');
    }
  }
  await page.evaluate(() => document.fonts.ready);
  const cards = page.locator('main section:has([data-rank-tier]):visible, main article:has([data-rank-tier]):visible');
  await expect(cards.first()).toBeVisible();
  const overflow = await cards.evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect();
    if (bounds.left >= -1 && bounds.right <= window.innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1) return [];
    return [{ label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 100), left: bounds.left, right: bounds.right, width: element.clientWidth, contentWidth: element.scrollWidth }];
  }));
  expect(overflow, `${description}: seasonal cards and their contents fit at ${width}px`).toEqual([]);
}

for (const [width, height] of [[390, 844], [768, 1024], [1366, 900]]) {
  test(`dark theme preserves readable admin forms, audit controls and seasonal ranks at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await seedPopulatedPreview(page, darkModeScenario());
    await gotoPreview(page, '/login');
    await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
    const violations: unknown[] = [];
    async function scan(view: string) {
      await darkAndFits(page, width);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      violations.push(...result.violations.map(item => ({ view, id: item.id, nodes: item.nodes.slice(0, 6).map(node => ({ target: node.target, summary: node.failureSummary })) })));
    }
    await scan('تسجيل الدخول');
    await loginPreview(page);
    const routes = ['/dashboard', '/employees', '/attendance', '/payroll', '/deductions', '/bonuses', '/departments', '/reports', '/settings', '/evaluations'];
    for (const path of routes) {
      await gotoPreview(page, path);
      await expect(page.locator('main h1')).toBeVisible();
      await scan(path);
      if (path === '/attendance') {
        await page.getByRole('link', { name: /^تفاصيل حضور / }).first().click();
        await expect(page.locator('main h1')).toBeVisible();
        await scan('تفاصيل يوم الحضور');
      }
    }
    await expect(page.locator('main h1')).toHaveText('التدقيق');
    for (const section of [
      { path: '/evaluations/seasons', title: 'المواسم', control: 'إغلاق الموسم' },
      { path: '/evaluations/cycles', title: 'دورات التقييم', control: 'إغلاق الدورة' },
      { path: '/evaluations/exams', title: 'الامتحانات', control: 'إضافة امتحان' },
    ]) {
      const card = page.locator(`main a[href="${section.path}"]`);
      await expect(card.getByRole('heading', { name: section.title, exact: true })).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      await expect(page.locator('main h1')).toHaveText(section.title);
      await expect(page.getByRole('button', { name: section.control, exact: true })).toBeVisible();
      await scan(section.path);
      if (section.path === '/evaluations/seasons') {
        await expectSeasonRankLayout(page, width, 'الترتيب الموسمي للإدارة');
        await page.screenshot({ path: testInfo.outputPath('dark-admin-season.png'), fullPage: true });
      }
      if (section.path !== '/evaluations/exams') {
        await page.locator('main').getByRole('link', { name: 'التدقيق', exact: true }).click();
        await expect(page).toHaveURL(/\/evaluations$/);
        await expect(page.locator('main h1')).toHaveText('التدقيق');
      }
    }

    await page.getByRole('button', { name: 'إضافة امتحان', exact: true }).click();
    const examDialog = page.getByRole('dialog', { name: 'إضافة امتحان', exact: true });
    await expect(examDialog).toBeVisible();
    await scan('نافذة الامتحان');
    await examDialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await gotoPreview(page, '/employees');
    await page.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
    const employeeDialog = page.getByRole('dialog', { name: 'إضافة موظف جديد', exact: true });
    await expect(employeeDialog).toBeVisible();
    await scan('نموذج بيانات الموظف');
    await employeeDialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();

    await gotoPreview(page, '/login?switch=1');
    await page.getByLabel('الحساب', { exact: true }).selectOption('CP-0004');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await finishWelcome(page);
    await gotoPreview(page, '/employee/audit');
    await page.getByLabel('اختيار الامتحان', { exact: true }).selectOption('dark-open-exam');
    await scan('إدخال التدقيق');
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).click();
    await scan('قائمة المصححين');
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).press('Escape');
    await page.screenshot({ path: testInfo.outputPath('dark-auditor.png'), fullPage: true });

    await loginPreview(page, 'موظف');
    await expectSeasonRankLayout(page, width, 'ملخص الموسم في رئيسية المصحح', true);
    await scan('رئيسية المصحح والرتبة');
    await gotoPreview(page, '/employee/evaluation');
    await page.getByLabel('اختيار امتحان التقييم', { exact: true }).selectOption('dark-closed-exam');
    await expectSeasonRankLayout(page, width, 'التقييم الموسمي للمصحح', true);
    await scan('التقييم المنشور والرتبة');
    await page.screenshot({ path: testInfo.outputPath('dark-corrector-season.png'), fullPage: true });
    expect(violations).toEqual([]);
  });
}
