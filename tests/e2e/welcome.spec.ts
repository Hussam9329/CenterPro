import { mkdir } from 'node:fs/promises';
import { test, expect, gotoPreview, loginPreview, waitForWelcome, finishWelcome, PREVIEW_TEST_TIME } from './helpers/preview';

const sizes = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1366, 768], [1440, 900], [1920, 1080]];

test('fresh load covers login for the full five seconds with the exact welcome message', async ({ page }) => {
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 60_000));
  await page.goto('/login');
  const welcome = await waitForWelcome(page);
  await expect(welcome).toHaveAttribute('data-welcome-sequence', 'initial');
  await expect(welcome.getByText('مرحباً بك موظفنا المميز', { exact: true })).toBeVisible();
  await expect(welcome.getByRole('img', { name: 'CenterPro', exact: true })).toBeVisible();
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toBeHidden();
  await page.clock.fastForward(4_900);
  await expect(welcome).toBeVisible();
  await page.clock.fastForward(99);
  await expect(welcome).toBeVisible();
  await page.clock.fastForward(1);
  await expect(welcome).toBeHidden();
  await expect(page.getByLabel('اسم المستخدم', { exact: true })).toBeVisible();
});

test('login shows five seconds before dashboard, internal navigation stays clear, reload welcomes again', async ({ page }) => {
  await gotoPreview(page, '/login');
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  const welcome = await waitForWelcome(page);
  await expect(welcome).toHaveAttribute('data-welcome-sequence', 'login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'لوحة المتابعة', exact: true })).toHaveCount(0);
  await page.clock.fastForward(4_900);
  await expect(welcome).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.clock.fastForward(100);
  await expect(welcome).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard$/);

  for (const [label, path] of [['الموظفون', '/employees'], ['الحضور', '/attendance'], ['الرواتب', '/payroll']]) {
    await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
    await page.clock.fastForward(5_000);
    await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  }

  await page.reload();
  const reloadedWelcome = await waitForWelcome(page);
  await expect(reloadedWelcome).toHaveAttribute('data-welcome-sequence', 'initial');
  await expect(page.getByRole('heading', { name: 'الرواتب', exact: true })).toBeHidden();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/payroll$/);
  await expect(page.getByRole('heading', { name: 'الرواتب', exact: true })).toBeVisible();
});

test('authenticated full navigation welcomes before the requested destination', async ({ page }) => {
  await loginPreview(page);
  await page.goto('/attendance');
  const welcome = await waitForWelcome(page);
  await expect(welcome).toHaveAttribute('data-welcome-sequence', 'initial');
  await expect(page.getByRole('heading', { name: 'الحضور', exact: true })).toBeHidden();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByRole('heading', { name: 'الحضور', exact: true })).toBeVisible();
});

test('logo motion composes once and reduced motion preserves the welcome duration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 60_000));
  await page.goto('/login');
  const welcome = await waitForWelcome(page);
  const animations = await welcome.evaluate(element => element.getAnimations({ subtree: true }).map(animation => {
    const timing = animation.effect?.getTiming();
    return { duration: timing?.duration, iterations: timing?.iterations };
  }));
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every(animation => animation.duration === 5_000 && animation.iterations === 1)).toBeTruthy();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await welcome.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(welcome.getByText('مرحباً بك موظفنا المميز', { exact: true })).toHaveCSS('opacity', '1');
  await page.clock.fastForward(4_900);
  await expect(welcome).toBeVisible();
  await page.clock.fastForward(100);
  await expect(welcome).toBeHidden();
});

for (const [width, height] of sizes) {
  test(`welcome logo and message fit ${width}x${height} with reduced motion`, async ({ page }) => {
    await mkdir('qa-artifacts', { recursive: true });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.pauseAt(new Date(PREVIEW_TEST_TIME.getTime() + 60_000));
    await page.goto('/login');
    const welcome = await waitForWelcome(page);
    await page.evaluate(() => document.fonts.ready);
    const logo = await welcome.getByRole('img', { name: 'CenterPro', exact: true }).boundingBox();
    const message = await welcome.getByText('مرحباً بك موظفنا المميز', { exact: true }).boundingBox();
    expect(logo).not.toBeNull();
    expect(message).not.toBeNull();
    expect(logo!.width / logo!.height).toBeCloseTo(175 / 51, 1);
    for (const [label, box] of [['logo', logo!], ['message', message!]] as const) {
      expect(box.x, `${label} starts within the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${label} starts within the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${label} ends within the viewport`).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height, `${label} ends within the viewport`).toBeLessThanOrEqual(height + 1);
    }
    expect(message!.y).toBeGreaterThanOrEqual(logo!.y + logo!.height);
    expect(await welcome.getByText('مرحباً بك موظفنا المميز', { exact: true }).evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: `qa-artifacts/welcome-reduced-${width}.png` });
    await finishWelcome(page);
    await expect(page.getByLabel('اسم المستخدم', { exact: true })).toBeVisible();
  });
}
