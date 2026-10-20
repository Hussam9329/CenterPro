import { test, expect, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';
import { dailyWord } from '../../src/lib/rest/daily-word';
import { DEMO_TODAY } from '../../src/lib/mock-data';

const key = (letter: string) => new RegExp(`^${letter}($|[ :،])`);

test.describe('Rest area', () => {
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page); });

  test('employee plays the daily word once, sees the leaderboard, and the owner sees the play details', async ({ page }) => {
    await loginPreview(page, 'موظف');
    await page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'استراحة', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'استراحة', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /كلمة اليوم/ }).click();
    for (const letter of Array.from(dailyWord(DEMO_TODAY))) await page.getByRole('button', { name: key(letter) }).first().click();
    await page.getByRole('button', { name: 'إدخال', exact: true }).click();
    await expect(page.getByText('أحسنت! عرفت الكلمة بـ 1 محاولات.')).toBeVisible();
    await gotoPreview(page, '/employee/rest/wordle');
    await expect(page.getByRole('heading', { name: 'أحسنت! حللت كلمة اليوم.' })).toBeVisible();
    await gotoPreview(page, '/employee/rest');
    await expect(page.getByText('لُعبت اليوم')).toBeVisible();
    await expect(page.locator('ol li').first()).toContainText('6');

    await gotoPreview(page, '/employee/rest/xo');
    for (const cell of [1, 4, 2, 5, 3]) await page.getByRole('button', { name: `المربع ${cell}: فارغ` }).click();
    await expect(page.getByText('فاز اللاعب X!').first()).toBeVisible();

    await loginPreview(page);
    await gotoPreview(page, '/rest-stats');
    await page.getByLabel('الفترة', { exact: true }).selectOption('all');
    const recent = page.getByRole('region', { name: 'آخر الجولات', exact: true });
    await expect(recent.getByRole('row')).toHaveCount(3);
    await expect(recent).toContainText('كلمة اليوم');
    await expect(recent).toContainText('إكس أو');
  });

  test('statistics stay owner-only and employees are kept inside their own area', async ({ page }) => {
    await loginPreview(page, 'مدير العمليات');
    await gotoPreview(page, '/rest-stats');
    await expect(page).toHaveURL(/\/dashboard$/);
    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/rest-stats');
    await expect(page).toHaveURL(/\/employee$/);
  });
});
