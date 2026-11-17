import { writeFileSync } from 'node:fs';
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { createPopulatedTestData } from '../tests/fixtures/populated-data';
import { seedPopulatedPreview, fillLoginCredentials, submitLogin } from '../tests/e2e/helpers/preview';

// Cold loads on an emulated slow phone: Lighthouse "mobile" settings
// (150 ms RTT, 1.6 Mbps down, 750 kbps up, 4x CPU slowdown), cache disabled.
const NETWORK = { offline: false, latency: 150, downloadThroughput: 1_638_400 / 8, uploadThroughput: 750_000 / 8 };
const CPU_SLOWDOWN = 4;

async function measure(page: Page, cdp: CDPSession, path: string, ready: (page: Page) => Promise<void>) {
  let bytes = 0; let requests = 0; let imageBytes = 0;
  const types = new Map<string, string>();
  const onResponse = (e: { requestId: string; type: string }) => types.set(e.requestId, e.type);
  const onFinished = (e: { requestId: string; encodedDataLength: number }) => {
    requests += 1; bytes += e.encodedDataLength; if (types.get(e.requestId) === 'Image') imageBytes += e.encodedDataLength;
  };
  cdp.on('Network.responseReceived', onResponse); cdp.on('Network.loadingFinished', onFinished);
  const start = Date.now();
  await page.goto(path, { waitUntil: 'load' });
  await ready(page);
  const readyMs = Date.now() - start;
  await page.waitForLoadState('networkidle');
  const vitals = await page.evaluate(() => new Promise<{ fcp: number; lcp: number; cls: number; tbt: number }>(resolve => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    let lcp = 0; let cls = 0; let tbt = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
    setTimeout(() => resolve({ fcp, lcp, cls, tbt }), 300);
  }));
  cdp.off('Network.responseReceived', onResponse); cdp.off('Network.loadingFinished', onFinished);
  return { path, readyMs, ...vitals, kb: Math.round(bytes / 1024), imageKb: Math.round(imageBytes / 1024), requests };
}

test('slow phone cold loads', async ({ page }) => {
  const data = createPopulatedTestData();
  // One closed exam with spread-out paper counts, so the leaderboard and profile show many rank tiers.
  const at = '2026-09-01T09:00:00.000Z';
  data.evaluationSeasons.push({ id: 'perf-season', name: 'موسم القياس', state: 'OPEN', startDate: '2026-09-01', openedAt: at, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'perf-cycle', seasonId: 'perf-season', name: 'دورة القياس', state: 'OPEN', openedAt: at, openedBy: 'مدير النظام' });
  data.evaluationExams.push({ id: 'perf-exam', cycleId: 'perf-cycle', name: 'امتحان القياس', date: '2026-09-18', state: 'CLOSED', note: '', createdAt: at, createdBy: 'مدير النظام' });
  data.employees.filter(e => e.active).forEach((e, i) => data.examEvaluations.push({ id: `perf-eval-${e.id}`, examId: 'perf-exam', employeeId: e.id, papers: 150 + i * 450, correctionErrors: 0, behaviorErrors: 0, note: '', createdAt: at, updatedAt: at, createdBy: 'مدير النظام', updatedBy: 'مدير النظام' }));
  await seedPopulatedPreview(page, data);
  await page.goto('/login?switch=1');
  await fillLoginCredentials(page);
  await submitLogin(page);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', NETWORK); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  const main = (page: Page) => expect(page.locator('main h1').first()).toBeVisible({ timeout: 60_000 });
  const corrector = data.examEvaluations.find(x => x.examId === 'perf-exam')!.employeeId;
  const rows = [
    await measure(page, cdp, '/dashboard', main),
    await measure(page, cdp, '/employees', main),
    await measure(page, cdp, `/employees/${corrector}`, main),
    await measure(page, cdp, '/evaluations/seasons', main),
    await measure(page, cdp, '/payroll', main),
  ];
  // Typing in the payroll search on the slow phone: worst keystroke-to-paint latency (INP-style).
  await page.evaluate(() => { (window as unknown as { __events: number[] }).__events = []; new PerformanceObserver(list => { for (const e of list.getEntries()) (window as unknown as { __events: number[] }).__events.push(e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit); });
  await page.getByPlaceholder('اسم الموظف أو رقمه').pressSequentially('محمد ع', { delay: 120 });
  await page.waitForTimeout(800);
  const typing = await page.evaluate(() => (window as unknown as { __events: number[] }).__events);
  const inp = typing.length ? Math.max(...typing) : 0;
  await page.context().clearCookies();
  await page.evaluate(() => { sessionStorage.clear(); });
  rows.unshift(await measure(page, cdp, '/login', p => expect(p.locator('form button[type="submit"]')).toBeVisible({ timeout: 60_000 })));
  const table = '| Page | Ready (ms) | FCP | LCP | CLS | TBT | Transferred | Images | Requests |\n|---|---|---|---|---|---|---|---|---|\n'
    + rows.map(r => `| ${r.path.replace(corrector, ':id')} | ${r.readyMs} | ${Math.round(r.fcp)} | ${Math.round(r.lcp)} | ${r.cls.toFixed(3)} | ${Math.round(r.tbt)} | ${r.kb} KB | ${r.imageKb} KB | ${r.requests} |`).join('\n') + '\n';
  const report = table + `\nPayroll search typing on the slow phone: worst keystroke latency ${Math.round(inp)} ms over ${typing.length} slow events.\n`;
  console.log(report);
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, report);
});
