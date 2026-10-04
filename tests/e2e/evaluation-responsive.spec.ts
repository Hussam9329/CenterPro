import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { createTestData } from '../../src/lib/mock-data';
import type { DemoData } from '../../src/lib/types';
import { test, expect, finishWelcome, gotoPreview, loginPreview, readPreviewData, seedPopulatedPreview } from './helpers/preview';

const sizes = [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 1366], [1366, 768], [1440, 900], [1920, 1080]];
const examId = 'responsive-evaluation-exam';
const examName = 'امتحان الفصل الثالث — مراجعة التكاثر والأجهزة الحيوية';
const auditorId = 'employee-jaafar-ali';
const correctorId = 'employee-abrar-haqi';
const managementSections = [
  { path: '/evaluations/seasons', title: 'المواسم', control: 'إغلاق الموسم', screenshot: 'admin-seasons' },
  { path: '/evaluations/cycles', title: 'دورات التقييم', control: 'إغلاق الدورة', screenshot: 'admin-cycles' },
  { path: '/evaluations/exams', title: 'الامتحانات', control: 'إضافة امتحان', screenshot: 'admin-exams' },
];

/** Explicit evaluation scenario: never seed evaluations in the application's startup data. */
function createEvaluationFixture(): DemoData {
  const fixture = createTestData();
  const timestamp = '2026-09-28T10:00:00.000Z';
  fixture.evaluationSeasons.push({ id: 'responsive-season', name: 'موسم الاختبار', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'المدير العام' });
  fixture.evaluationCycles.push({
    id: 'responsive-evaluation-cycle', seasonId: 'responsive-season', name: 'دورة تقييم المصححين — المراجعة الشاملة للفصل الثالث',
    state: 'OPEN', openedAt: timestamp, openedBy: 'المدير العام',
  });
  fixture.evaluationExams.push({
    id: examId, cycleId: 'responsive-evaluation-cycle', name: examName, date: '2026-09-28',
    note: 'مراجعة دقة تصحيح الإجابات والالتزام بتعليمات المدقق، مع متابعة الأوراق والأخطاء لكل مصحح بصورة مستقلة.',
    state: 'OPEN', createdBy: 'المدير العام', createdAt: timestamp,
  });
  const values = [[1250, 12, 3], [900, 9, 1], [640, 6, 2], [90, 25, 8]];
  fixture.employees.filter(employee => employee.departmentId === 'department-correction-test').forEach((employee, index) => {
    const [papers, correctionErrors, behaviorErrors] = values[index];
    fixture.examEvaluations.push({
      id: `responsive-evaluation-${employee.id}`, employeeId: employee.id, examId,
      papers, correctionErrors, behaviorErrors, note: 'بيانات اختبار صريحة لفحص الواجهات على أحجام الشاشات المختلفة.',
      createdBy: 'جعفر علي', createdAt: timestamp, updatedBy: 'جعفر علي', updatedAt: timestamp,
    });
  });
  return fixture;
}

async function loginAsAuditor(page: Page) {
  await gotoPreview(page, '/login');
  await page.getByLabel('الحساب', { exact: true }).selectOption(auditorId);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(/\/employee$/);
}

async function openManagementSection(page: Page, section: typeof managementSections[number]) {
  await expect(page.locator('main h1')).toHaveText('التدقيق');
  const card = page.locator(`main a[href="${section.path}"]`);
  await expect(card.getByRole('heading', { name: section.title, exact: true })).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${section.path}$`));
  await expect(page.locator('main h1')).toHaveText(section.title);
  await expect(page.getByRole('button', { name: section.control, exact: true })).toBeVisible();
}

async function returnToEvaluationHub(page: Page) {
  await page.locator('main').getByRole('link', { name: 'التدقيق', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluations$/);
  await expect(page.locator('main h1')).toHaveText('التدقيق');
}

async function expectSurfaceFits(surface: Locator, width: number, description: string) {
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box, `${description}: surface exists`).not.toBeNull();
  expect(box!.x, `${description}: left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${description}: right edge`).toBeLessThanOrEqual(width + 1);
  expect(await surface.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${description}: content fits without clipping`).toBeTruthy();
}

async function expectEvaluationLayout(page: Page, width: number, description: string) {
  await expect(page.locator('main h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${description}: body overflow at ${width}px`).toBeTruthy();

  // Body-only checks miss clipped card content and undersized grids with overflow:hidden.
  // Deliberately allow a table's own scroll container, but require its enclosing card to fit.
  const problems = await page.locator('main .card, main article, main section, main .stat-card, main a:has(h2)').evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height || getComputedStyle(element).visibility === 'hidden') return [];
    const insideViewport = bounds.left >= -1 && bounds.right <= window.innerWidth + 1;
    const contentsFit = element.scrollWidth <= element.clientWidth + 1;
    if (insideViewport && contentsFit) return [];
    return [{
      element: element.tagName.toLowerCase(), label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 100),
      left: Math.round(bounds.left), right: Math.round(bounds.right), width: element.clientWidth, contentWidth: element.scrollWidth,
    }];
  }));
  expect(problems, `${description}: every visible card and its contents must fit at ${width}px`).toEqual([]);
}

async function expectEditorsFit(page: Page, width: number) {
  const editors = page.getByRole('article', { name: /^تدقيق / });
  await expect(editors).toHaveCount(4);
  for (const editor of await editors.all()) {
    const name = await editor.getAttribute('aria-label');
    await expectSurfaceFits(editor, width, `${name}: card`);
    const papers = editor.getByLabel('عدد الأوراق المصححة', { exact: true });
    await expect(papers).toBeVisible();
    await expect(papers).toBeEnabled();
    for (const label of ['أخطاء التصحيح', 'أخطاء السلوك']) {
      const input = editor.getByLabel(label, { exact: true });
      const stepper = input.locator('..');
      await expectSurfaceFits(stepper, width, `${name}: ${label}`);
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(editor.getByRole('button', { name: `إنقاص ${label}`, exact: true })).toBeVisible();
      await expect(editor.getByRole('button', { name: `زيادة ${label}`, exact: true })).toBeVisible();
      const measurements = await stepper.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll('button, input')].map(control => {
          const box = control.getBoundingClientRect();
          return {
            label: control.getAttribute('aria-label') || 'حقل العدد',
            fits: box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1,
            width: box.width, height: box.height,
          };
        });
      });
      expect(measurements, `${name}: ${label} must have exactly two buttons and an input`).toHaveLength(3);
      expect(measurements.filter(control => !control.fits), `${name}: ${label} controls must not overlap or be clipped at ${width}px`).toEqual([]);
      for (const control of measurements) {
        expect(control.width, `${name}: ${control.label} usable width at ${width}px`).toBeGreaterThanOrEqual(32);
        expect(control.height, `${name}: ${control.label} usable height at ${width}px`).toBeGreaterThanOrEqual(32);
      }
    }
  }
}

async function screenshot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage });
}

for (const [width, height] of sizes) {
  test(`evaluation workflows fit cards and controls at ${width}x${height}`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await seedPopulatedPreview(page, createEvaluationFixture());
    await loginPreview(page);

    await gotoPreview(page, '/evaluations');
    await expect(page.locator('main h1')).toHaveText('التدقيق');
    await expectEvaluationLayout(page, width, 'مركز التدقيق');
    await screenshot(page, testInfo, `${width}-admin-evaluations`);
    for (const section of managementSections) {
      await openManagementSection(page, section);
      await expectEvaluationLayout(page, width, section.title);
      await screenshot(page, testInfo, `${width}-${section.screenshot}`);
      if (section.path !== '/evaluations/exams') await returnToEvaluationHub(page);
    }

    await page.getByRole('button', { name: 'إضافة امتحان', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'إضافة امتحان', exact: true });
    await dialog.getByLabel('اسم الامتحان', { exact: false }).fill(examName);
    await dialog.getByLabel('ملاحظة', { exact: false }).fill('مراجعة فحص تجاوب نافذة إضافة الامتحان دون تغيير بيانات السيناريو.');
    await expectSurfaceFits(dialog, width, 'نافذة إضافة امتحان');
    await screenshot(page, testInfo, `${width}-exam-dialog`);
    await dialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();

    await gotoPreview(page, `/evaluations/${examId}`);
    await expect(page.getByRole('heading', { name: examName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'سجل إدخالات المدققين', exact: true })).toBeVisible();
    await expectEvaluationLayout(page, width, 'تفاصيل الامتحان');
    await screenshot(page, testInfo, `${width}-exam-detail`);

    await loginAsAuditor(page);
    await gotoPreview(page, '/employee/audit');
    await expect(page.getByRole('heading', { name: 'التدقيق', exact: true })).toBeVisible();
    await expectEvaluationLayout(page, width, 'مساحة المدقق');
    await expectEditorsFit(page, width);

    const chooser = page.getByRole('button', { name: 'اختيار المصححين', exact: true });
    await chooser.click();
    const choices = page.getByRole('group', { name: 'المصححون المختارون', exact: true });
    await expectSurfaceFits(choices, width, 'قائمة اختيار المصححين');
    const triggerBox = await chooser.boundingBox();
    const panelBox = await choices.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    const anchoredBelow = Math.abs(panelBox!.y - (triggerBox!.y + triggerBox!.height + 7)) <= 3;
    const anchoredAbove = Math.abs((panelBox!.y + panelBox!.height + 7) - triggerBox!.y) <= 3;
    expect(anchoredBelow || anchoredAbove, 'قائمة المصححين يجب أن تخرج من نفس حقل الفلتر لا من أسفل الشاشة').toBeTruthy();
    await expect(choices.getByRole('checkbox')).toHaveCount(4);
    for (const name of ['ابرار حقي', 'هبة محمد', 'فاطمة فراس', 'مريم عصام']) {
      await expect(choices.getByRole('checkbox', { name, exact: true })).toBeChecked();
    }
    // Full-page capture can temporarily resize visualViewport to 1×1, which
    // correctly dismisses an anchored panel whose trigger leaves that viewport.
    // Capture this transient control in its actual viewport; pages stay full-size.
    await screenshot(page, testInfo, `${width}-auditor-multiselect`, false);
    await expect(choices).toBeVisible();
    await choices.getByRole('button', { name: 'إلغاء التحديد', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'لم تختر أي مصحح', exact: true })).toBeVisible();
    await choices.getByRole('checkbox', { name: 'ابرار حقي', exact: true }).check();
    await expect(page.getByRole('article', { name: /^تدقيق / })).toHaveCount(1);
    await choices.getByRole('button', { name: 'تحديد الكل', exact: true }).click();
    await chooser.press('Escape');
    await expect(choices).toBeHidden();
    await expectEditorsFit(page, width);

    const editor = page.getByRole('article', { name: 'تدقيق ابرار حقي', exact: true });
    const correctionErrors = editor.getByLabel('أخطاء التصحيح', { exact: true });
    await expect(correctionErrors).toHaveValue('12');
    await editor.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true }).click();
    await expect(correctionErrors).toHaveValue('13');
    await editor.getByRole('button', { name: 'إنقاص أخطاء التصحيح', exact: true }).click();
    await expect(correctionErrors).toHaveValue('12');
    await editor.getByLabel('عدد الأوراق المصححة', { exact: true }).fill('1251');
    await page.getByLabel('البحث في المصححين المختارين', { exact: true }).click();
    await expect.poll(async () => (await readPreviewData(page)).examEvaluations.find(row => row.employeeId === correctorId && row.examId === examId)?.papers).toBe(1251);
    await expectEvaluationLayout(page, width, 'مساحة المدقق بعد الإدخال');
    await screenshot(page, testInfo, `${width}-auditor-workspace`);

    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.getByRole('heading', { name: 'التقييمات', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ابرار حقي', exact: true })).toBeVisible();
    await expectEvaluationLayout(page, width, 'تقييم المصحح');
    await expect(page.getByLabel('اختيار دورة التقييم', { exact: true })).toBeVisible();
    await expect(page.getByLabel('اختيار امتحان التقييم', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'زيادة أخطاء التصحيح', exact: true })).toHaveCount(0);
    await screenshot(page, testInfo, `${width}-corrector-evaluation`);
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [[390, 844], [1366, 768]]) {
  test(`evaluation interfaces and accessible controls at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height });
    await seedPopulatedPreview(page, createEvaluationFixture());
    await loginPreview(page);
    const violations: unknown[] = [];
    async function scan(label: string) {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      violations.push(...results.violations.map(violation => ({ page: label, id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
    }
    await gotoPreview(page, '/evaluations');
    await expect(page.locator('main h1')).toHaveText('التدقيق');
    await scan('مركز التدقيق');
    for (const section of managementSections) {
      await openManagementSection(page, section);
      await scan(section.title);
      if (section.path !== '/evaluations/exams') await returnToEvaluationHub(page);
    }
    await page.getByRole('button', { name: 'إضافة امتحان', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'إضافة امتحان', exact: true })).toBeVisible();
    await scan('إضافة امتحان');
    await page.getByRole('dialog', { name: 'إضافة امتحان', exact: true }).getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
    await gotoPreview(page, `/evaluations/${examId}`);
    await expect(page.locator('main h1')).toHaveText(examName);
    await scan('تفاصيل الامتحان');
    await loginAsAuditor(page);
    await gotoPreview(page, '/employee/audit');
    await expect(page.locator('main h1')).toHaveText('التدقيق');
    await expect(page.getByRole('button', { name: 'اختيار المصححين', exact: true })).toBeVisible();
    await scan('مساحة المدقق');
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).click();
    await scan('اختيار عدة مصححين');
    await page.getByRole('button', { name: 'اختيار المصححين', exact: true }).press('Escape');
    await loginPreview(page, 'موظف');
    await gotoPreview(page, '/employee/evaluation');
    await expect(page.locator('main h1')).toHaveText('التقييمات');
    await expect(page.getByLabel('اختيار امتحان التقييم', { exact: true })).toBeVisible();
    await scan('تقييم المصحح');
    expect(violations).toEqual([]);
  });
}
