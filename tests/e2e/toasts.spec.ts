import type { Page } from '@playwright/test';
import { test, expect, gotoPreview, loginPreview } from './helpers/preview';

const savedMessage = 'تم حفظ الإعدادات التجريبية وتسجيل التغيير في سجل العمليات.';
const resetMessage = 'تم تصفير المعاينة. يمكنك إنشاء الأقسام والموظفين من البداية.';

async function openSettings(page: Page) {
  await loginPreview(page);
  await gotoPreview(page, '/settings');
  await expect(page.getByRole('heading', { name: 'الإعدادات', exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100));
}

async function saveName(page: Page, name: string) {
  await page.getByLabel('اسم المركز', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toHaveText(savedMessage);
}

test('toast announces feedback and automatically dismisses after 3200 ms without a close button', async ({ page }) => {
  await openSettings(page);
  await saveName(page, 'مركز اختبار التنبيهات');
  const toast = page.locator('.toast[role="status"]');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(toast.getByRole('button')).toHaveCount(0);
  await page.clock.fastForward(3199);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(1);
  await expect(toast).toHaveCount(0);
  await expect(page.getByLabel('اسم المركز', { exact: true })).toHaveValue('مركز اختبار التنبيهات');
});

test('a replacement notification receives its own complete dismissal interval', async ({ page }) => {
  await openSettings(page);
  await saveName(page, 'مركز قبل إعادة الضبط');
  const original = await page.locator('.toast').elementHandle();
  await page.clock.fastForward(2800);
  await page.getByRole('button', { name: 'تصفير بيانات المعاينة', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'إعادة ضبط جميع بيانات المعاينة؟' });
  await expect(dialog.getByText(/لا يمكن التراجع عن هذا الإجراء/)).toBeVisible();
  await dialog.getByLabel('اكتب «إعادة ضبط» للتأكيد').fill('إعادة ضبط');
  await dialog.getByRole('button', { name: 'تأكيد إعادة ضبط المعاينة', exact: true }).click();
  const toast = page.locator('.toast');
  await expect(toast).toHaveText(resetMessage);
  expect(await original!.evaluate(element => element.isConnected)).toBe(false);
  await page.clock.fastForward(400);
  await expect(toast).toHaveText(resetMessage);
  await page.clock.fastForward(2799);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(1);
  await expect(toast).toHaveCount(0);
});

test('repeating the same notification in the same millisecond restarts its CSS animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSettings(page);
  await saveName(page, 'الاسم الأول');
  const original = await page.locator('.toast').elementHandle();
  const timestamp = await page.evaluate(() => Date.now());
  // Exercise a replacement after the outgoing CSS animation has hidden the old
  // toast, independently of the paused JavaScript dismissal timer.
  await original!.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
  await expect(page.locator('.toast')).toHaveCSS('opacity', '0');
  await saveName(page, 'الاسم الثاني');
  expect(await page.evaluate(() => Date.now())).toBe(timestamp);
  expect(await original!.evaluate(element => element.isConnected)).toBe(false);
  await page.clock.runFor(200);
  await expect(page.locator('.toast')).toHaveCSS('opacity', '1');
  await page.clock.fastForward(2999);
  await expect(page.locator('.toast')).toHaveCount(1);
  await page.clock.fastForward(1);
  await expect(page.locator('.toast')).toHaveCount(0);
});
