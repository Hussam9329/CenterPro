import { mkdir } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import { test, expect, gotoPreview, waitForWelcome, finishWelcome, readPreviewSession, PREVIEW_TEST_TIME, WELCOME_PERIOD_MS } from './helpers/preview';

const sizes = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1366, 768], [1440, 900], [1920, 1080]];

async function expectApprovedWelcomeLogo(welcome: Locator, theme: 'light' | 'dark' = 'light') {
  const logo = welcome.getByRole('img', { name: 'CenterPro', exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', theme === 'dark' ? '/brand/logo-white.svg' : '/brand/logo.svg');
  await expect(welcome.locator('svg')).toHaveCount(0);
  const dimensions = await logo.evaluate(async element => {
    if (!(element instanceof HTMLImageElement)) throw new Error('Welcome must use the approved image asset.');
    await element.decode();
    const bounds = element.getBoundingClientRect();
    return {
      loaded: element.complete && element.naturalWidth > 0 && element.naturalHeight > 0,
      naturalRatio: element.naturalWidth / element.naturalHeight,
      renderedRatio: bounds.width / bounds.height,
      objectFit: getComputedStyle(element).objectFit,
    };
  });
  expect(dimensions.loaded, 'The approved logo has actually decoded').toBeTruthy();
  expect(dimensions.naturalRatio).toBeCloseTo(175 / 51, 2);
  expect(dimensions.renderedRatio, 'The full brand artwork keeps its original proportions').toBeCloseTo(dimensions.naturalRatio, 2);
  expect(dimensions.objectFit).toBe('contain');
  return logo;
}

test('fresh login page opens directly without a welcome splash', async ({ page }) => {
  await gotoPreview(page, '/login');
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await expect(page.getByLabel('الحساب', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CenterPro معك بكل خطوة.', exact: true })).toBeVisible();
  await expect(page.locator('.login-form-copyright')).toHaveText('Kal-EL VISIONS © 2026');
  await page.clock.fastForward(WELCOME_PERIOD_MS);
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
});

test('loading test data does not sign in or show a welcome until the user submits login', async ({ page }) => {
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: 'تحميل بيانات الاختبار', exact: true }).click();
  await expect(page.getByLabel('الحساب', { exact: true }).locator('option')).toHaveCount(8);
  await expect(page).toHaveURL(/\/login$/);
  expect(await readPreviewSession(page)).toBeNull();
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('successful login shows the centered three-second welcome and internal navigation/reload do not replay it', async ({ page }) => {
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 1_000));
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const welcome = await waitForWelcome(page);
  await expect(welcome).toHaveAttribute('data-welcome-sequence', 'login');
  await expect(welcome.getByText('اهلاً بيك', { exact: true })).toBeVisible();
  await expect(welcome.getByText('موظفنا الـ مو عادي', { exact: true })).toBeVisible();
  await expectApprovedWelcomeLogo(welcome);
  await page.clock.fastForward(WELCOME_PERIOD_MS - 1);
  await expect(welcome).toBeVisible();
  await page.clock.fastForward(1);
  await expect(welcome).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'الموظفون', exact: true }).click();
  await expect(page).toHaveURL('/employees');
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  await expect(page).toHaveURL(/\/employees$/);
});

test('reduced motion keeps the three-second post-login welcome without complex animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 1_000));
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const welcome = await waitForWelcome(page);
  expect(await welcome.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expectApprovedWelcomeLogo(welcome);
  await expect(welcome.getByText('موظفنا الـ مو عادي', { exact: true })).toBeVisible();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('dark welcome uses the approved white logo with normal motion and the same exact three-second duration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 1_000));
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const welcome = await waitForWelcome(page);
  const logo = await expectApprovedWelcomeLogo(welcome, 'dark');
  expect(await logo.evaluate(element => element.getAnimations().some(animation => animation.effect?.getTiming().duration === 3000)), 'Normal motion animates the complete approved image').toBeTruthy();
  await page.clock.fastForward(WELCOME_PERIOD_MS - 1);
  await expect(welcome).toBeVisible();
  await page.clock.fastForward(1);
  await expect(welcome).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard$/);
});

for (const [width, height] of sizes) {
  test(`post-login welcome remains centered and fits ${width}x${height}`, async ({ page }) => {
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 1_000));
    await gotoPreview(page, '/login');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    const welcome = await waitForWelcome(page);
    await page.evaluate(() => document.fonts.ready);
    const logo = await (await expectApprovedWelcomeLogo(welcome)).boundingBox();
    const line1 = await welcome.getByText('اهلاً بيك', { exact: true }).boundingBox();
    const line2 = await welcome.getByText('موظفنا الـ مو عادي', { exact: true }).boundingBox();
    for (const [label, box] of [['logo', logo], ['line1', line1], ['line2', line2]] as const) {
      expect(box, `${label} exists`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    }
    expect(line1!.y).toBeGreaterThanOrEqual(logo!.y + logo!.height);
    expect(line2!.y).toBeGreaterThan(line1!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `qa-artifacts/welcome-login-${width}.png` });
    await finishWelcome(page);
  });
}
