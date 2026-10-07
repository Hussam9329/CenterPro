import type { Locator, Page } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import { test, expect, finishWelcome, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

const ranks = [
  ['Bronze 1', 0], ['Bronze 2', 500], ['Bronze 3', 1000],
  ['Silver 1', 1500], ['Silver 2', 2000], ['Silver 3', 2500],
  ['Gold 1', 3000], ['Gold 2', 3500], ['Gold 3', 4000],
  ['Platinum 1', 4500], ['Platinum 2', 5000], ['Platinum 3', 5500],
  ['Diamond 1', 6000], ['Diamond 2', 6500], ['Diamond 3', 7000],
  ['Emerald 1', 7500], ['Emerald 2', 8000], ['Emerald 3', 8500],
  ['Master 1', 9000], ['Master 2', 10000], ['Master 3', 11000], ['Grandmaster', 12000],
] as const;

function rankScenario() {
  const data = createTestData();
  const timestamp = '2026-09-01T09:00:00.000Z';
  const correctors = data.employees.filter(employee => employee.departmentId === 'department-correction-test');
  data.evaluationSeasons.push({ id: 'asset-season', name: 'موسم الرتب', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'asset-cycle', seasonId: 'asset-season', name: 'دورة جميع الرتب', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationExams.push({ id: 'asset-exam', cycleId: 'asset-cycle', name: 'امتحان الرتب المنشور', date: '2026-09-20', state: 'CLOSED', note: '', createdAt: timestamp, createdBy: 'مدير النظام' });
  ranks.forEach(([, score], index) => {
    const employee = correctors[index] ?? {
      ...correctors[0], id: `asset-corrector-${index}`, code: `CP-${String(100 + index).padStart(4, '0')}`,
      name: `مصحح الرتبة ${index + 1}`, username: `ASSET${index}`,
    };
    if (!correctors[index]) data.employees.push(employee);
    data.examEvaluations.push({ id: `asset-evaluation-${index}`, examId: 'asset-exam', employeeId: employee.id, papers: score, correctionErrors: 0, behaviorErrors: 0, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  });
  return data;
}

async function expectRankAssets(scope: Locator) {
  const visible = scope.locator('[data-rank-tier]:visible');
  await expect(visible).toHaveCount(22);
  // Desktop rows and mobile cards are both mounted; only the active layout is
  // visible. Inspect every image in that layout without assuming hidden markup.
  await expect(visible.locator('img')).toHaveCount(22);
  await expect(scope.locator('[data-rank-tier] svg, [data-rank-tier] canvas')).toHaveCount(0);
  for (const image of await visible.locator('img').all()) {
    // Next/Image lazily loads leaderboard rows outside the viewport. Reveal
    // each real row before decoding instead of bypassing its loading behavior.
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => (element as HTMLImageElement).decode());
  }
  const results = await visible.evaluateAll(async badges => Promise.all(badges.map(async badge => {
    const img = badge.querySelector('img') as HTMLImageElement;
    await img.decode();
    const source = img.currentSrc || img.src;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0, 256, 256);
    const pixels = context.getImageData(0, 0, 256, 256).data;
    let painted = 0; let touchesEdge = false;
    const pixelHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), byte => byte.toString(16).padStart(2, '0')).join('');
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] > 16) {
        painted += 1;
        const x = (offset / 4) % 256; const y = Math.floor(offset / 4 / 256);
        if (x === 0 || y === 0 || x === 255 || y === 255) touchesEdge = true;
      }
    }
    const css = getComputedStyle(img);
    const layers = [badge, img.parentElement!, img].map(element => getComputedStyle(element));
    return {
      name: badge.textContent?.trim(), source, pixelHash, painted, touchesEdge,
      fitsImage: css.objectFit === 'contain' && css.objectPosition === '50% 50%',
      noShadow: layers.every(layer => layer.filter === 'none' && layer.boxShadow === 'none'),
      integrated: layers.every(layer => (layer.backgroundColor === 'rgba(0, 0, 0, 0)' || layer.backgroundColor === 'transparent')
        && layer.backgroundImage === 'none'
        && [layer.borderTopWidth, layer.borderRightWidth, layer.borderBottomWidth, layer.borderLeftWidth].every(width => width === '0px')),
    };
  })));
  expect(results.map(item => item.name).sort()).toEqual(ranks.map(([name]) => name).sort());
  expect(new Set(results.map(item => item.source)).size).toBe(22);
  expect(new Set(results.map(item => item.pixelHash)).size, 'All 22 loaded emblems have distinct browser-painted pixels, not only different URLs').toBe(22);
  for (const rank of results) {
    expect(rank.source).toMatch(/\/ranks\/(?:bronze|silver|gold|platinum|diamond|emerald|master)-[123]\.png|\/ranks\/grandmaster\.png/);
    expect(rank.painted, `${rank.name}: nonempty transparent artwork`).toBeGreaterThan(1000);
    expect(rank.painted, `${rank.name}: transparent breathing room`).toBeLessThan(60_000);
    expect(rank.touchesEdge, `${rank.name}: artwork must not be clipped`).toBeFalsy();
    expect(rank.fitsImage, `${rank.name}: intrinsic artwork keeps its aspect ratio and is centered`).toBeTruthy();
    expect(rank.noShadow, `${rank.name}: no drop shadow or image shadow`).toBeTruthy();
    expect(rank.integrated, `${rank.name}: no separate tile behind the emblem`).toBeTruthy();
  }
}

async function expectSeasonFits(page: Page, scope: Locator) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  expect(await scope.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= -1 && bounds.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
  }), 'The enclosing season card fits without clipped content').toBeTruthy();
  const problems = await scope.locator('article:visible, [data-rank-tier]:visible').evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect();
    const isCard = element.tagName === 'ARTICLE';
    const container = element.closest('article, td')?.getBoundingClientRect() ?? bounds;
    const fits = isCard ? bounds.left >= -1 && bounds.right <= innerWidth + 1
      : bounds.left >= container.left - 1 && bounds.right <= container.right + 1;
    return fits && element.scrollWidth <= element.clientWidth + 1 ? [] : [element.textContent?.trim() || element.getAttribute('aria-label')];
  }));
  expect(problems, 'Every seasonal card and rank label fits its own container').toEqual([]);
}

for (const scenario of [
  { width: 1366, height: 900, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
] as const) {
  test(`all 22 approved rank assets remain clean in ${scenario.theme} mode at ${scenario.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await seedPopulatedPreview(page, rankScenario());
    await gotoPreview(page, '/login');
    if (scenario.theme === 'dark') await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
    await loginPreview(page);
    await gotoPreview(page, '/evaluations/seasons');
    await expect(page.locator('main h1')).toHaveText('المواسم');
    const leaderboard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Leaderboard الموسم', exact: true }) });
    await expect(leaderboard).toBeVisible();
    await expectRankAssets(leaderboard);
    await expectSeasonFits(page, leaderboard);
    await page.screenshot({ path: testInfo.outputPath(`rank-assets-${scenario.theme}-${scenario.width}.png`), fullPage: true });
  });
}

test('shine is clipped to the rank asset and disabled by reduced motion without hiding the emblem', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedPopulatedPreview(page, rankScenario());
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption('asset-corrector-21');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  const season = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
  const badge = season.locator('[data-rank-tier="grandmaster"]');
  const image = badge.locator('img');
  const shine = badge.locator('[data-rank-shine]');
  await expect(season.getByRole('img', { name: 'Grandmaster', exact: true })).toBeVisible();
  await expect(season.getByRole('heading', { name: 'Grandmaster', exact: true })).toHaveCount(1);
  await expect(image).toBeVisible();
  await image.evaluate(element => (element as HTMLImageElement).decode());
  await expect(shine).toBeVisible();
  expect(await shine.evaluate(element => {
    const css = getComputedStyle(element);
    const image = element.parentElement!.querySelector('img')!;
    return (css.maskImage || css.getPropertyValue('-webkit-mask-image')).includes(image.currentSrc)
      && css.maskSize === getComputedStyle(image).objectFit && css.maskRepeat === 'no-repeat'
      && css.maskPosition === getComputedStyle(image).objectPosition && css.pointerEvents === 'none';
  }), 'Shine uses the exact loaded asset alpha mask, size and alignment').toBeTruthy();
  await expect.poll(() => shine.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  const bounds = await image.boundingBox();
  expect(await shine.boundingBox(), 'The masked shine aligns with the image, including its transparent padding').toEqual(bounds);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => shine.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await expect(shine).toBeHidden();
  await expect(image).toBeVisible();
  expect(await image.boundingBox()).toEqual(bounds);
  await expectSeasonFits(page, season);
});
