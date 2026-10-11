import type { Page } from '@playwright/test';
import { test, expect, gotoPreview, loginPreview, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const result = (page: Page) => page.getByRole('status', { name: 'نتيجة الحاسبة', exact: true });
const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function openCalculator(page: Page) {
  await loginPreview(page);
  await gotoPreview(page, '/calculator');
  await expect(result(page)).toHaveText('0');
}

async function pressKeys(page: Page, ...names: string[]) {
  for (const name of names) await key(page, name).click();
}

async function typeCalculation(page: Page, expression: string) {
  await page.locator('#main-content').focus();
  await page.keyboard.type(expression);
}

for (const role of ['المدير العام', 'مدير العمليات', 'موظف'] as const) {
  test(`calculator is a standalone tool for ${role} and returns to its opening page`, async ({ page }) => {
    await seedPopulatedPreview(page);
    await loginPreview(page, role);
    const origin = role === 'موظف' ? '/employee/salary' : '/reports';
    await gotoPreview(page, origin);
    const before = await readPreviewData(page);
    const calculatorLink = page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'الحاسبة', exact: true });
    await expect(calculatorLink).toHaveAttribute('href', `/calculator?returnTo=${encodeURIComponent(origin)}`);
    await calculatorLink.click();
    await expect(result(page)).toHaveText('0');
    await expect(page.locator('.app-shell, .sidebar, .topbar, .mobile-bottom-nav, .app-footer')).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(20);
    await expect(page.locator('#main-content')).toHaveAttribute('tabindex', '-1');
    await expect(page.getByRole('link', { name: 'انتقل إلى المحتوى', exact: true })).toHaveAttribute('href', '#main-content');
    await pressKeys(page, '6', '×', '7', '=');
    await expect(result(page)).toHaveText('42');
    expect(await readPreviewData(page)).toEqual(before);
    await key(page, 'رجوع').click();
    await expect(page).toHaveURL(new RegExp(`${origin}$`));
  });
}

test('calculator requires the existing preview login', async ({ page }) => {
  await gotoPreview(page, '/calculator');
  await expect(page).toHaveURL(/\/login$/);
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'اسم المستخدم', exact: false })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
});

test('calculator keeps immediate arithmetic, decimal precision and replacement operators', async ({ page }) => {
  await openCalculator(page);
  await pressKeys(page, '1', '2', '+', '7', '=');
  await expect(result(page)).toHaveText('19');
  // Results start a new entry when a digit is pressed, and can continue with an operator.
  await pressKeys(page, '5', '−', '8', '=');
  await expect(result(page)).toHaveText('-3');
  await pressKeys(page, '×', '4', '=');
  await expect(result(page)).toHaveText('-12');
  await pressKeys(page, '÷', '3', '=');
  await expect(result(page)).toHaveText('-4');
  // Escape clears both the display and any pending arithmetic.
  await page.keyboard.press('Escape');
  await typeCalculation(page, '0.1+0.2=');
  await expect(result(page)).toHaveText('0.3');
  await page.keyboard.press('Escape');
  await typeCalculation(page, '2+3*4=');
  await expect(result(page)).toHaveText('20');
  await page.keyboard.press('Escape');
  await typeCalculation(page, '2+*3=');
  await expect(result(page)).toHaveText('6');
  // Repeated equals does not invent a repeated-operation mode.
  await page.keyboard.press('Enter');
  await expect(result(page)).toHaveText('6');
});

test('calculator handles sign, percent, entry clear and all clear', async ({ page }) => {
  await openCalculator(page);
  await expect(key(page, 'AC')).toBeVisible();
  await pressKeys(page, '8', '±');
  await expect(result(page)).toHaveText('-8');
  await pressKeys(page, '%');
  await expect(result(page)).toHaveText('-0.08');
  await pressKeys(page, '±');
  await expect(result(page)).toHaveText('0.08');
  await page.keyboard.press('Escape');
  await pressKeys(page, '5', '+', '±', '2', '=');
  await expect(result(page)).toHaveText('3');
  await page.keyboard.press('Escape');
  await pressKeys(page, '±', '.', '5');
  await expect(result(page)).toHaveText('-0.5');
  await page.keyboard.press('Escape');
  await pressKeys(page, '8', '+', '2', 'C', '9', '=');
  await expect(result(page)).toHaveText('17');
  await pressKeys(page, '+', '2', 'C', 'C');
  await expect(key(page, 'AC')).toBeVisible();
  await pressKeys(page, '3', '=');
  await expect(result(page)).toHaveText('3');
  await page.keyboard.press('Escape');
  await pressKeys(page, '2', '0', '0', '+', '5', '0', '%', '=');
  await expect(result(page)).toHaveText('200.5');
});

test('division by zero is recoverable and keyboard editing does not retain stale operations', async ({ page }) => {
  await openCalculator(page);
  await typeCalculation(page, '9/0=');
  await expect(result(page)).toHaveText('خطأ');
  await pressKeys(page, '4', '+', '2', '=');
  await expect(result(page)).toHaveText('6');
  await typeCalculation(page, '/0=');
  await expect(result(page)).toHaveText('خطأ');
  await pressKeys(page, '.', '5');
  await expect(result(page)).toHaveText('0.5');
  await page.keyboard.press('Escape');
  await typeCalculation(page, '12');
  await page.keyboard.press('Backspace');
  await expect(result(page)).toHaveText('1');
  await page.keyboard.press('Backspace');
  await expect(result(page)).toHaveText('0');
  await typeCalculation(page, '1,5x2');
  await page.keyboard.press('Enter');
  await expect(result(page)).toHaveText('3');
  await page.keyboard.press('Backspace');
  await expect(result(page)).toHaveText('0');
});

test('calculator keyboard respects focused controls, browser shortcuts and editable targets', async ({ page }) => {
  await openCalculator(page);
  await typeCalculation(page, '2+');
  await key(page, '3').focus();
  await page.keyboard.press('Enter');
  await expect(result(page)).toHaveText('3');
  await key(page, '=').focus();
  await page.keyboard.press('Enter');
  await expect(result(page)).toHaveText('5');

  const shortcuts = await page.evaluate(() => {
    const main = document.querySelector('#main-content') as HTMLElement;
    main.focus();
    return [
      { key: '1', ctrlKey: true }, { key: '+', metaKey: true },
      { key: 'Backspace', altKey: true }, { key: '6', isComposing: true },
    ].map(options => {
      const event = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
      main.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(shortcuts).toEqual([false, false, false, false]);
  await expect(result(page)).toHaveText('5');

  const editablePrevented = await page.evaluate(() => {
    const field = document.createElement('input');
    document.querySelector('main')!.appendChild(field);
    const event = new KeyboardEvent('keydown', { key: '9', bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    field.remove();
    return event.defaultPrevented;
  });
  expect(editablePrevented).toBe(false);
  await expect(result(page)).toHaveText('5');
  await key(page, 'رجوع').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('direct entry and invalid return targets use the role home instead of browser history', async ({ page }) => {
  await seedPopulatedPreview(page);
  await loginPreview(page);
  // A real previous page exists, but direct entry must not navigate back to it.
  await gotoPreview(page, '/reports');
  for (const target of [null, 'https://example.com', '//example.com', '/\\example.com', '/login', '/api/payroll', '/employee/salary']) {
    await gotoPreview(page, target === null ? '/calculator' : `/calculator?returnTo=${encodeURIComponent(target)}`);
    await expect(result(page)).toHaveText('0');
    await key(page, 'رجوع').click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await loginPreview(page, 'مدير العمليات');
  await gotoPreview(page, '/calculator?returnTo=%2Fsettings');
  await key(page, 'رجوع').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await loginPreview(page, 'موظف');
  await gotoPreview(page, '/calculator?returnTo=%2Fpayroll');
  await key(page, 'رجوع').click();
  await expect(page).toHaveURL(/\/employee$/);
  await gotoPreview(page, '/calculator');
  await key(page, 'رجوع').click();
  await expect(page).toHaveURL(/\/employee$/);
});

for (const [width, height] of [[360, 800], [667, 375], [1024, 768]]) {
  test(`calculator fits long values and preserves keypad order at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openCalculator(page);
    await page.evaluate(() => document.fonts.ready);
    await typeCalculation(page, '1234567890123');
    await expect(result(page)).toHaveText('123456789012');
    await pressKeys(page, '±', '.');
    await expect(result(page)).toHaveText('-123456789012.');
    const displayFits = async () => {
      expect(await result(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    };
    await displayFits();
    const boxes = await Promise.all(['7', '8', '9', '×'].map(name => key(page, name).boundingBox()));
    for (let index = 0; index < boxes.length; index++) {
      expect(boxes[index]).not.toBeNull();
      expect(boxes[index]!.width).toBeGreaterThanOrEqual(44);
      expect(boxes[index]!.height).toBeGreaterThanOrEqual(44);
      if (index) expect(boxes[index]!.x).toBeGreaterThan(boxes[index - 1]!.x);
    }
    const back = await key(page, 'رجوع').boundingBox();
    const panel = await page.getByRole('region', { name: 'الحاسبة', exact: true }).boundingBox();
    expect(back).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(
      back!.y + back!.height <= panel!.y || back!.x >= panel!.x + panel!.width || back!.x + back!.width <= panel!.x,
      'The Back button must not overlap the calculator panel',
    ).toBe(true);
    await pressKeys(page, '×', '7', '=');
    await expect(result(page)).toHaveText('-8.641975e+11');
    await displayFits();
    await page.screenshot({ path: `qa-artifacts/calculator-${width}x${height}.png`, fullPage: true });
    await page.evaluate(() => localStorage.setItem('centerpro-theme', 'dark'));
    await page.reload();
    await expect(page.locator('#main-content')).toHaveAttribute('data-theme', 'dark');
    await typeCalculation(page, '123456789012*7=');
    await expect(result(page)).toHaveText('8.641975e+11');
    await displayFits();
    await page.screenshot({ path: `qa-artifacts/calculator-dark-${width}x${height}.png`, fullPage: true });
  });
}
