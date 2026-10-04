import { mkdir } from 'node:fs/promises';
import { test, expect, gotoPreview, waitForWelcome, finishWelcome, readPreviewSession, PREVIEW_TEST_TIME, WELCOME_PERIOD_MS } from './helpers/preview';

const sizes = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1366, 768], [1440, 900], [1920, 1080]];

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
  await gotoPreview(page, '/login');
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 1_000));
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const welcome = await waitForWelcome(page);
  await expect(welcome).toHaveAttribute('data-welcome-sequence', 'login');
  await expect(welcome.getByText('اهلاً بيك', { exact: true })).toBeVisible();
  await expect(welcome.getByText('موظفنا الـ مو عادي', { exact: true })).toBeVisible();
  await expect(welcome.getByRole('img', { name: 'CenterPro', exact: true })).toBeVisible();
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
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const welcome = await waitForWelcome(page);
  expect(await welcome.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(welcome.getByText('موظفنا الـ مو عادي', { exact: true })).toBeVisible();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

for (const [width, height] of sizes) {
  test(`post-login welcome remains centered and fits ${width}x${height}`, async ({ page }) => {
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoPreview(page, '/login');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    const welcome = await waitForWelcome(page);
    await page.evaluate(() => document.fonts.ready);
    const logo = await welcome.getByRole('img', { name: 'CenterPro', exact: true }).boundingBox();
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
