import type { Locator, Page } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import { test, expect, finishWelcome, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

// Exercise the real seasonal leaderboard, including both DOM layouts mounted at
// once. A standalone SVG snapshot would miss duplicate IDs across rank instances.
const ranks = [
  ['Bronze 1', 0], ['Bronze 2', 500], ['Bronze 3', 1000],
  ['Silver 1', 1500], ['Silver 2', 2000], ['Silver 3', 2500],
  ['Gold 1', 3000], ['Gold 2', 3500], ['Gold 3', 4000],
  ['Platinum 1', 4500], ['Platinum 2', 5000], ['Platinum 3', 5500],
  ['Diamond 1', 6000], ['Diamond 2', 6500], ['Diamond 3', 7000],
  ['Emerald 1', 7500], ['Emerald 2', 8000], ['Emerald 3', 8500],
  ['Master 1', 9000], ['Master 2', 10000], ['Master 3', 11000], ['Grandmaster', 12000],
] as const;

function nativeRankScenario() {
  const data = createTestData();
  const timestamp = '2026-09-01T09:00:00.000Z';
  const correctors = data.employees.filter(employee => employee.departmentId === 'department-correction-test');
  data.evaluationSeasons.push({ id: 'native-season', name: 'موسم الرتب المتجهية', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'native-cycle', seasonId: 'native-season', name: 'دورة جميع الرتب', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationExams.push({ id: 'native-exam', cycleId: 'native-cycle', name: 'امتحان الرتب المنشور', date: '2026-09-20', state: 'CLOSED', note: '', createdAt: timestamp, createdBy: 'مدير النظام' });
  ranks.forEach(([, score], index) => {
    const employee = correctors[index] ?? {
      ...correctors[0], id: `native-corrector-${index}`, code: `CP-${String(100 + index).padStart(4, '0')}`,
      name: `مصحح الرتبة ${index + 1}`, username: `NATIVE${index}`,
    };
    if (!correctors[index]) data.employees.push(employee);
    data.examEvaluations.push({ id: `native-evaluation-${index}`, examId: 'native-exam', employeeId: employee.id, papers: score, correctionErrors: 0, behaviorErrors: 0, note: '', createdAt: timestamp, updatedAt: timestamp, createdBy: 'جعفر علي', updatedBy: 'جعفر علي' });
  });
  return data;
}

async function expectReferenceIsolation(scope: Locator) {
  const problems = await scope.locator('[data-rank-tier] svg').evaluateAll(elements => {
    const issues: string[] = [];
    const ids = elements.flatMap(svg => [...svg.querySelectorAll('[id]')].map(element => element.id));
    if (ids.length !== new Set(ids).size) issues.push('SVG instances share definition IDs');
    for (const svg of elements) {
      const name = svg.closest('[data-rank-tier]')?.textContent?.trim() || 'rank';
      if (svg.querySelector('image, foreignObject')) issues.push(`${name}: embedded bitmap or HTML`);
      let references = 0;
      for (const element of svg.querySelectorAll('*')) {
        for (const attribute of element.attributes) {
          const refs = [...attribute.value.matchAll(/url\(["']?#([^"')]+)["']?\)/g)].map(match => match[1]);
          if (attribute.localName === 'href' && attribute.value.startsWith('#')) refs.push(attribute.value.slice(1));
          for (const id of refs) {
            references += 1;
            const target = document.getElementById(id);
            if (!target || !svg.contains(target)) issues.push(`${name}: unresolved or cross-rank reference ${id}`);
          }
        }
      }
      if (!references) issues.push(`${name}: no native paint references`);
    }
    return issues;
  });
  expect(problems, 'Every gradient and clip path resolves inside its own mounted rank').toEqual([]);
}

async function expectRanksPaint(scope: Locator) {
  const visible = scope.locator('[data-rank-tier]:visible');
  await expect(visible).toHaveCount(22);
  await expect(scope.locator('[data-rank-tier] img, [data-rank-tier] image, [data-rank-tier] canvas')).toHaveCount(0);
  const artwork = await visible.evaluateAll(async badges => {
    return Promise.all(badges.map(async badge => {
      const svg = badge.querySelector('svg') as SVGSVGElement;
      const group = svg.querySelector(':scope > g') as SVGGElement;
      const bounds = group.getBBox();
      const viewBox = svg.viewBox.baseVal;
      const fits = bounds.x >= viewBox.x && bounds.y >= viewBox.y
        && bounds.x + bounds.width <= viewBox.x + viewBox.width
        && bounds.y + bounds.height <= viewBox.y + viewBox.height;
      const css = getComputedStyle(group);
      const nativeBackground = [badge, ...badge.querySelectorAll('*')].every(element => getComputedStyle(element).backgroundImage === 'none');
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', '256');
      clone.setAttribute('height', '256');
      // Ask the browser to paint the rendered SVG, rather than equating a path
      // element's existence with a visible, distinct emblem.
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, 256, 256);
      const pixels = context.getImageData(0, 0, 256, 256).data;
      let painted = 0; let hash = 2166136261; let touchesEdge = false;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        for (let channel = 0; channel < 4; channel += 1) hash = Math.imul(hash ^ pixels[offset + channel], 16777619);
        if (pixels[offset + 3] > 16) {
          painted += 1;
          const x = (offset / 4) % 256; const y = Math.floor(offset / 4 / 256);
          if (x === 0 || y === 0 || x === 255 || y === 255) touchesEdge = true;
        }
      }
      return {
        name: badge.textContent?.trim(), hash, painted, touchesEdge, fits, nativeBackground,
        visible: css.display !== 'none' && css.visibility === 'visible' && Number(css.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
      };
    }));
  });
  expect(artwork.map(item => item.name).sort()).toEqual(ranks.map(([name]) => name).sort());
  expect(new Set(artwork.map(item => item.hash)).size, 'All 22 browser-painted emblems must differ').toBe(22);
  for (const rank of artwork) {
    expect(rank.visible && rank.fits && rank.nativeBackground, `${rank.name}: visible native geometry fits the viewBox`).toBeTruthy();
    expect(rank.painted, `${rank.name}: nonempty artwork`).toBeGreaterThan(1000);
    expect(rank.painted, `${rank.name}: transparent canvas around the emblem`).toBeLessThan(60_000);
    expect(rank.touchesEdge, `${rank.name}: emblem is not cut off by its canvas`).toBeFalsy();
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
    return fits && element.scrollWidth <= element.clientWidth + 1 ? [] : [element.textContent?.trim()];
  }));
  expect(problems, 'Season cards and badge labels fit their actual containers').toEqual([]);
}

for (const scenario of [
  { width: 1366, height: 900, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
] as const) {
  test(`all 22 native ranks paint independently in the ${scenario.theme} season at ${scenario.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const bitmapRequests: string[] = [];
    page.on('request', request => { if (/\/ranks\/.*\.(png|jpe?g|webp)(?:\?|$)/i.test(request.url())) bitmapRequests.push(request.url()); });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await seedPopulatedPreview(page, nativeRankScenario());
    await gotoPreview(page, '/login');
    if (scenario.theme === 'dark') await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
    await loginPreview(page);
    await gotoPreview(page, '/evaluations/seasons');
    await expect(page.locator('main h1')).toHaveText('المواسم');
    const leaderboard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Leaderboard الموسم', exact: true }) });
    await expect(leaderboard).toBeVisible();
    await expectRanksPaint(leaderboard);
    await expectReferenceIsolation(leaderboard);
    await expectSeasonFits(page, leaderboard);
    expect(bitmapRequests, 'The live page must not request the replaced raster rank assets').toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`native-ranks-${scenario.theme}-${scenario.width}.png`), fullPage: true });
  });
}

test('the published employee rank stops its shine under reduced motion without hiding native artwork', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedPopulatedPreview(page, nativeRankScenario());
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption('native-corrector-21');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  const season = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
  await expect(season).toBeVisible();
  await expect(season.getByRole('img', { name: 'Grandmaster', exact: true })).toBeVisible();
  await expect(season.getByRole('heading', { name: 'Grandmaster', exact: true })).toHaveCount(1);
  const svg = season.locator('[data-rank-tier="grandmaster"] svg');
  await expect(svg).toBeVisible();
  await expectReferenceIsolation(season);
  await expect.poll(() => svg.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  const bounds = await svg.boundingBox();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => svg.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await expect(svg).toBeVisible();
  expect(await svg.boundingBox(), 'Reduced motion preserves the rank layout').toEqual(bounds);
  expect(await svg.evaluate(element => {
    const artwork = element.querySelector(':scope > g') as SVGGElement;
    const css = getComputedStyle(artwork);
    return artwork.getBBox().width > 0 && css.display !== 'none' && css.visibility === 'visible' && Number(css.opacity) > 0;
  }), 'Reduced motion preserves the emblem itself').toBeTruthy();
  await expectSeasonFits(page, season);
});
