import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';
import { createPopulatedTestData } from '../fixtures/populated-data';

const sizes = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1366, 768], [1440, 900], [1920, 1080]];
const adminRoutes = ['/dashboard', '/employees', '/departments', '/attendance', '/payroll', '/deductions', '/bonuses', '/reports', '/audit', '/settings', '/attendance-display'];
const employeeRoutes = ['/employee', '/employee/attendance', '/employee/salary', '/employee/profile', '/employee/scan'];

async function checkRoute(page: Page, path: string, width: number, scenario: string) {
  await gotoPreview(page, path);
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `${scenario}: ${path} horizontal overflow at ${width}`,
  ).toBeTruthy();
  await page.screenshot({ path: `qa-artifacts/${scenario}-${width}-${path.slice(1).replaceAll('/', '-')}.png`, fullPage: true });
}

async function checkDialog(page: Page, title: string, width: number, screenshotName: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${title}: body must not overflow at ${width}`).toBeTruthy();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${title}: content must fit the dialog at ${width}`).toBeTruthy();
  await page.screenshot({ path: `qa-artifacts/${width}-${screenshotName}.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
  await expect(dialog).toBeHidden();
}

for (const [width, height] of sizes) {
  test(`empty installation responsive at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loginPreview(page);
    for (const path of adminRoutes) await checkRoute(page, path, width, 'empty');
    expect(errors).toEqual([]);
  });

  test(`populated workflows responsive at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await seedPopulatedPreview(page);
    await loginPreview(page);
    for (const path of [...adminRoutes, '/employees/CP-0001', '/attendance/wd-2026-09-28', '/attendance/wd-2026-09-27']) {
      await checkRoute(page, path, width, 'populated');
    }
    await loginPreview(page, 'موظف');
    for (const path of employeeRoutes) await checkRoute(page, path, width, 'populated');
    expect(errors).toEqual([]);
  });

  test(`attendance dialogs responsive at ${width}x${height}`, async ({ page }) => {
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    const fixture = createPopulatedTestData();
    fixture.workdays.forEach(day => { day.state = 'CLOSED'; });
    await seedPopulatedPreview(page, fixture);
    await loginPreview(page);
    await gotoPreview(page, '/attendance');
    await page.getByRole('button', { name: 'فتح يوم حضور جديد', exact: true }).click();
    await checkDialog(page, 'فتح يوم حضور جديد', width, 'attendance-open-dialog');
    await gotoPreview(page, '/attendance/wd-2026-09-28');
    await page.getByRole('button', { name: 'تعديل اليوم', exact: true }).click();
    await checkDialog(page, 'تعديل يوم الحضور', width, 'attendance-edit-dialog');
    await page.getByRole('button', { name: /^(مراجعة|مراجعة الحالة)$/ }).filter({ visible: true }).first().click();
    await checkDialog(page, 'مراجعة سجل الحضور', width, 'attendance-status-dialog');
  });
}

test('unified attendance navigation and legacy route redirect', async ({ page }) => {
  await loginPreview(page);
  await expect(page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'الحضور', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'أيام العمل', exact: true })).toHaveCount(0);
  await gotoPreview(page, '/workdays');
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByRole('heading', { name: 'الحضور', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'أيام العمل', exact: true })).toHaveCount(0);
});

test('empty key pages meet accessibility checks', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoPreview(page, '/login');
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toBeVisible();
  await loginPreview(page);
  const violations: unknown[] = [];
  for (const path of ['/dashboard', '/employees', '/attendance', '/payroll', '/settings']) {
    await gotoPreview(page, path);
    await expect(page.locator('h1')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    violations.push(...result.violations.map(v => ({ path, id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
  }
  expect(violations).toEqual([]);
});

test('populated attendance detail meets accessibility checks', async ({ page }) => {
  await seedPopulatedPreview(page);
  await loginPreview(page);
  await gotoPreview(page, '/attendance/wd-2026-09-28');
  await expect(page.locator('h1')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
});
