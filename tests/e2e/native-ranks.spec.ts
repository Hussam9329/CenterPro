import type { Locator, Page } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import { test, expect, loginAccount, gotoPreview, loginPreview, seedPopulatedPreview } from './helpers/preview';

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
  await expect(visible.locator('[data-rank-outline]')).toHaveCount(22);
  for (const image of await visible.locator('img').all()) {
    // Next/Image lazily loads leaderboard rows outside the viewport. Reveal
    // each real row before decoding instead of bypassing its loading behavior.
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => (element as HTMLImageElement).decode());
  }
  const results = await visible.evaluateAll(async badges => {
    async function loadMask(mask: string) {
      const source = /^url\(["']?(.*?)["']?\)$/.exec(mask)?.[1];
      if (!source) throw new Error(`Expected a single vector mask URL, received ${mask}`);
      const response = await fetch(source);
      if (!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml')) {
        throw new Error(`Vector mask failed to load: ${source} (${response.status})`);
      }
      const image = new Image();
      const objectUrl = URL.createObjectURL(await response.blob());
      try {
        image.src = objectUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, 256, 256);
        const pixels = context.getImageData(0, 0, 256, 256).data;
        let painted = 0; let alphaArea = 0; let touchesEdge = false;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          alphaArea += pixels[offset + 3] / 255;
          if (pixels[offset + 3] <= 16) continue;
          painted += 1;
          const x = (offset / 4) % 256; const y = Math.floor(offset / 4 / 256);
          if (x === 0 || y === 0 || x === 255 || y === 255) touchesEdge = true;
        }
        return { path: new URL(source, location.href).pathname, pixels, painted, alphaArea, touchesEdge, square: image.naturalWidth === image.naturalHeight };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    // CSS can report a correct-looking mask URL even when the file is missing,
    // which makes the emblem disappear. Decode all four real served resources.
    const masks = new Map<string, ReturnType<typeof loadMask>>();
    function getMask(css: CSSStyleDeclaration) {
      const source = css.maskImage || css.getPropertyValue('-webkit-mask-image');
      if (!masks.has(source)) masks.set(source, loadMask(source));
      return masks.get(source)!;
    }
    return Promise.all(badges.map(async badge => {
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
    const outline = badge.querySelector('[data-rank-outline]') as HTMLElement;
    const outlineCss = getComputedStyle(outline);
    const [shapeMask, outlineMask] = await Promise.all([getMask(css), getMask(outlineCss)]);
    const prefix = badge.getAttribute('data-rank-tier') === 'grandmaster' ? 'grandmaster' : 'rank';
    let originalAlpha = 0; let retainedAlpha = 0; let detachedOutline = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      originalAlpha += pixels[offset + 3];
      retainedAlpha += pixels[offset + 3] * shapeMask.pixels[offset + 3] / 255;
      if (outlineMask.pixels[offset + 3] <= 16) continue;
      const x = (offset / 4) % 256; const y = Math.floor(offset / 4 / 256);
      let touchesShape = false;
      // Allow two raster pixels for the centered vector stroke and antialiasing;
      // a disconnected outline or the wrong silhouette still fails this check.
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        if (x + dx < 0 || x + dx > 255 || y + dy < 0 || y + dy > 255) continue;
        if (shapeMask.pixels[((y + dy) * 256 + x + dx) * 4 + 3] > 16) touchesShape = true;
      }
      if (!touchesShape) detachedOutline += 1;
    }
    const imageBounds = img.getBoundingClientRect();
    const outlineBounds = outline.getBoundingClientRect();
    const layers = [badge, img.parentElement!, img].map(element => getComputedStyle(element));
    return {
      name: badge.textContent?.trim(), source, pixelHash, painted, touchesEdge, resolution: [img.naturalWidth, img.naturalHeight],
      fitsImage: css.objectFit === 'contain' && css.objectPosition === '50% 50%',
      correctMasks: shapeMask.path === `/ranks/${prefix}-shape-mask.svg` && outlineMask.path === `/ranks/${prefix}-outline-mask.svg`,
      maskGeometry: [shapeMask, outlineMask].map(({ path, painted, alphaArea, touchesEdge, square }) => ({ path, painted, alphaArea, touchesEdge, square })),
      outlineAreaRatio: outlineMask.alphaArea / shapeMask.alphaArea,
      retainedArtwork: retainedAlpha / originalAlpha, detachedOutline,
      alignedMasks: [css, outlineCss].every(layer => layer.maskSize === 'contain' && layer.maskRepeat === 'no-repeat' && layer.maskPosition === '50% 50%')
        && ['x', 'y', 'width', 'height'].every(key => imageBounds[key as keyof DOMRect] === outlineBounds[key as keyof DOMRect]),
      visibleOutline: outlineCss.pointerEvents === 'none' && outlineCss.opacity === '1' && outlineCss.display !== 'none'
        && outlineCss.backgroundColor !== 'rgba(0, 0, 0, 0)' && outlineCss.filter === 'none' && outlineCss.boxShadow === 'none',
      noShadow: layers.every(layer => layer.filter === 'none' && layer.boxShadow === 'none'),
      integrated: layers.every(layer => (layer.backgroundColor === 'rgba(0, 0, 0, 0)' || layer.backgroundColor === 'transparent')
        && layer.backgroundImage === 'none'
        && [layer.borderTopWidth, layer.borderRightWidth, layer.borderBottomWidth, layer.borderLeftWidth].every(width => width === '0px')),
    };
    }));
  });
  expect(results.map(item => item.name).sort()).toEqual(ranks.map(([name]) => name).sort());
  expect(new Set(results.map(item => item.source)).size).toBe(22);
  expect(new Set(results.map(item => item.pixelHash)).size, 'All 22 loaded emblems have distinct browser-painted pixels, not only different URLs').toBe(22);
  for (const rank of results) {
    expect(rank.resolution, `${rank.name}: the full-resolution asset is loaded`).toEqual([1024, 1024]);
    expect(rank.source).toMatch(/\/ranks\/(?:bronze|silver|gold|platinum|diamond|emerald|master)-[123]\.png|\/ranks\/grandmaster\.png/);
    expect(rank.painted, `${rank.name}: nonempty transparent artwork`).toBeGreaterThan(1000);
    expect(rank.painted, `${rank.name}: transparent breathing room`).toBeLessThan(60_000);
    expect(rank.touchesEdge, `${rank.name}: artwork must not be clipped`).toBeFalsy();
    expect(rank.fitsImage, `${rank.name}: intrinsic artwork keeps its aspect ratio and is centered`).toBeTruthy();
    expect(rank.correctMasks, `${rank.name}: normal and Grandmaster silhouettes are assigned correctly`).toBeTruthy();
    for (const mask of rank.maskGeometry) {
      expect(mask.square, `${rank.name}: ${mask.path} preserves the square coordinate system`).toBeTruthy();
      expect(mask.painted, `${rank.name}: ${mask.path} contains visible artwork`).toBeGreaterThan(0);
      expect(mask.painted, `${rank.name}: ${mask.path} has transparent breathing room`).toBeLessThan(60_000);
      expect(mask.touchesEdge, `${rank.name}: ${mask.path} is not clipped by its image bounds`).toBeFalsy();
    }
    expect(rank.maskGeometry[0].painted, `${rank.name}: the silhouette is a substantial filled shape`).toBeGreaterThan(1000);
    // Weight partial alpha coverage: counting every antialiased fringe pixel as
    // solid overstates a thin outline, especially Grandmaster's fourth component.
    expect(rank.outlineAreaRatio, `${rank.name}: the outline remains a thin edge, not a filled tile`).toBeLessThan(.2);
    // Approved PNG contours vary; the shared clean silhouette trims their rough
    // perimeter (about 13% at most). Catch substantial clipping or disappearance
    // without requiring the mask to retain the very edges this patch removes.
    expect(rank.retainedArtwork, `${rank.name}: the silhouette preserves the approved raster artwork`).toBeGreaterThan(.85);
    expect(rank.detachedOutline, `${rank.name}: the outline remains connected to the silhouette, without a detached halo`).toBe(0);
    expect(rank.alignedMasks, `${rank.name}: image and vector outline have identical bounds and mask alignment`).toBeTruthy();
    expect(rank.visibleOutline, `${rank.name}: the colored edge is visible and shadow-free`).toBeTruthy();
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

test('shine is clipped to the rank asset and disabled by reduced motion without hiding the emblem', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedPopulatedPreview(page, rankScenario());
  await gotoPreview(page, '/login');
  await loginAccount(page, 'asset-corrector-21');
  const season = page.getByRole('region', { name: 'ملخص تقييم الموسم', exact: true });
  const badge = season.locator('[data-rank-tier="grandmaster"]');
  const image = badge.locator('img');
  const outline = badge.locator('[data-rank-outline]');
  const shine = badge.locator('[data-rank-shine]');
  await expect(season.getByRole('img', { name: 'Grandmaster', exact: true })).toBeVisible();
  await expect(season.getByRole('heading', { name: 'Grandmaster', exact: true })).toHaveCount(1);
  await expect(image).toBeVisible();
  await image.evaluate(element => (element as HTMLImageElement).decode());
  await expect(shine).toBeVisible();
  expect(await shine.evaluate(element => {
    const css = getComputedStyle(element);
    const image = element.parentElement!.querySelector('img')!;
    const mask = css.maskImage || css.getPropertyValue('-webkit-mask-image');
    const imageCss = getComputedStyle(image);
    return /\/ranks\/grandmaster-shape-mask\.svg/.test(mask)
      && mask === (imageCss.maskImage || imageCss.getPropertyValue('-webkit-mask-image'))
      && css.maskSize === 'contain' && css.maskRepeat === 'no-repeat'
      && css.maskPosition === '50% 50%' && css.pointerEvents === 'none';
  }), 'Shine uses the same Grandmaster vector silhouette, size and alignment as the image').toBeTruthy();
  await expect.poll(() => shine.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);
  const bounds = await image.boundingBox();
  expect(await shine.boundingBox(), 'The masked shine aligns with the image, including its transparent padding').toEqual(bounds);
  expect(await outline.boundingBox(), 'The vector outline aligns with the image').toEqual(bounds);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => shine.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await expect(shine).toBeHidden();
  await expect(image).toBeVisible();
  await expect(outline).toBeVisible();
  expect(await image.boundingBox()).toEqual(bounds);
  await expectSeasonFits(page, season);
  await season.screenshot({ path: testInfo.outputPath('grandmaster-vector-edge-390.png') });
});
