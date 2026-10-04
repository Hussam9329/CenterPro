import type { Locator, Page } from '@playwright/test';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { test, expect, finishWelcome, gotoPreview, seedPopulatedPreview } from './helpers/preview';

function filterFixture(extraEmployees = 0) {
  const data = createPopulatedTestData();
  const timestamp = '2026-09-28T08:00:00.000Z';
  data.evaluationSeasons = [{ id: 'filter-season', name: 'موسم اختبار الفلتر', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationCycles = [{ id: 'filter-cycle', seasonId: 'filter-season', name: 'دورة اختبار الفلتر', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' }];
  data.evaluationExams = [{ id: 'filter-exam', cycleId: 'filter-cycle', name: 'امتحان اختبار الفلتر', date: '2026-09-28', state: 'OPEN', note: '', createdAt: timestamp, createdBy: 'مدير النظام' }];
  for (let index = 0; index < extraEmployees; index++) {
    data.employees.push({ ...data.employees[0], id: `filter-person-${index}`, code: `CP-${1000 + index}`, username: `filter-person-${index}`, name: `مصحح اختبار ${index + 1}` });
  }
  return data;
}

async function openAuditor(page: Page, extraEmployees = 0) {
  await seedPopulatedPreview(page, filterFixture(extraEmployees));
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption('CP-0004');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/employee$/);
  await gotoPreview(page, '/employee/audit');
  await expect(page.getByRole('heading', { name: 'التدقيق', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function filterControls(page: Page) {
  return {
    trigger: page.getByRole('button', { name: 'اختيار المصححين', exact: true }),
    panel: page.getByRole('group', { name: 'المصححون المختارون', exact: true }),
  };
}

async function positionTrigger(trigger: Locator, bottom: number) {
  await trigger.evaluate((element, targetBottom) => {
    window.scrollBy(0, element.getBoundingClientRect().bottom - targetBottom);
  }, bottom);
}

async function expectAnchored(page: Page, trigger: Locator, panel: Locator) {
  await expect(panel).toBeVisible();
  const [anchor, popover] = await Promise.all([trigger.boundingBox(), panel.boundingBox()]);
  expect(anchor).not.toBeNull();
  expect(popover).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(popover!.x).toBeGreaterThanOrEqual(11);
  expect(popover!.y).toBeGreaterThanOrEqual(11);
  expect(popover!.x + popover!.width).toBeLessThanOrEqual(viewport.width - 11);
  expect(popover!.y + popover!.height).toBeLessThanOrEqual(viewport.height - 11);
  expect(Math.abs(popover!.width - anchor!.width)).toBeLessThanOrEqual(1);
  const gap = await panel.getAttribute('data-side') === 'top'
    ? anchor!.y - popover!.y - popover!.height
    : popover!.y - anchor!.y - anchor!.height;
  expect(gap).toBeGreaterThanOrEqual(6);
  expect(gap).toBeLessThanOrEqual(8);
}

test('auditor filter supports keyboard selection, natural tab order and outside dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openAuditor(page);
  const { trigger, panel } = filterControls(page);
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(panel.getByRole('button', { name: 'تحديد الكل', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('button', { name: 'إلغاء التحديد', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const first = panel.getByRole('checkbox', { name: 'علي محمد حسن', exact: true });
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).not.toBeChecked();
  await expect(page.getByRole('article', { name: 'تدقيق علي محمد حسن', exact: true })).toHaveCount(0);
  await page.keyboard.press('End');
  await expect(panel.getByRole('checkbox').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel).toBeHidden();
  await expect(page.getByLabel('البحث في المصححين المختارين', { exact: true })).toBeFocused();

  await trigger.focus();
  await trigger.press('ArrowUp');
  await expect(panel.getByRole('checkbox').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.getByRole('heading', { name: 'التدقيق', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('narrow auditor filter flips directly above and follows the trigger while scrolling and resizing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 520 });
  await openAuditor(page);
  const { trigger, panel } = filterControls(page);
  await positionTrigger(trigger, 430);
  await trigger.click();
  await expect(panel).toHaveAttribute('data-side', 'top');
  await expectAnchored(page, trigger, panel);
  await page.screenshot({ path: testInfo.outputPath('narrow-auditor-filter-top.png') });
  const original = (await panel.boundingBox())!;
  await page.evaluate(() => window.scrollBy(0, 35));
  await expect.poll(async () => (await panel.boundingBox())?.y).toBeCloseTo(original.y - 35, 0);
  await expectAnchored(page, trigger, panel);
  await page.setViewportSize({ width: 340, height: 520 });
  await expectAnchored(page, trigger, panel);
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('long auditor choices stay inside a short viewport and keyboard focus scrolls within the popover', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 460 });
  await openAuditor(page, 16);
  const { trigger, panel } = filterControls(page);
  await positionTrigger(trigger, 250);
  await trigger.focus();
  await trigger.press('ArrowUp');
  await expectAnchored(page, trigger, panel);
  const last = panel.getByRole('checkbox').last();
  await expect(last).toBeFocused();
  const bounds = (await panel.boundingBox())!;
  const focused = (await last.boundingBox())!;
  expect(focused.y).toBeGreaterThanOrEqual(bounds.y);
  expect(focused.y + focused.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight && element.scrollTop > 0)).toBe(true);
  await page.keyboard.press('Home');
  await expect(panel.getByRole('button', { name: 'تحديد الكل', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(panel).toBeHidden();
  await expect(page.getByLabel('اختيار الامتحان', { exact: true })).toBeFocused();
});
