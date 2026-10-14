import { test, expect, type Page, type Route } from '@playwright/test';
import { createInitialData } from '../../src/lib/mock-data';
import type { RemoteSnapshot } from '../../src/lib/server-contract';
import type { DemoData, DemoSession, Workday } from '../../src/lib/types';

const owner: DemoSession = { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام', authVersion: 1 };
const display: DemoSession = { kind: 'QR_DISPLAY', role: 'QR_DISPLAY', name: 'شاشة الحضور', authVersion: 1 };
const day: Workday = { id: 'display-day', date: '2026-10-14', startTime: '14:00:00', state: 'OPEN', departmentIds: [], overrides: {} };
function snapshot(session: DemoSession | null = display, data: DemoData = createInitialData()): RemoteSnapshot {
  return { data, session, revision: 11, ready: true, remembered: true, systemConfigured: true, systemUsername: '', qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false, today: '2026-10-14', month: '2026-10', serverTime: '2026-10-14T12:00:00.000Z', backend: 'neon', pendingImport: false };
}
function openSnapshot() {
  const next = snapshot();
  next.data.workdays = [day];
  return next;
}
async function transport(page: Page, read: () => RemoteSnapshot, request?: (route: Route, pathname: string) => Promise<void>) {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/state') return route.fulfill({ json: read() });
    if (request) return request(route, pathname);
    return route.fulfill({ status: 404, json: { error: 'طلب غير متوقع في الاختبار' } });
  });
}
async function issueQr(page: Page, route: Route, token: string) {
  const serverTime = await page.evaluate(() => Date.now());
  await route.fulfill({ json: { token, workdayId: day.id, serverTime, expiresAt: serverTime + 45_000 } });
}
const qrImage = (page: Page) => page.locator('svg').filter({ has: page.locator('title', { hasText: 'رمز تسجيل الحضور' }) });

test('QR login remembers the dedicated session and skips the employee welcome', async ({ page }) => {
  let current = snapshot(null);
  await page.addInitScript(() => {
    const seen = { welcome: false };
    Object.defineProperty(window, '__displayLogin', { value: seen });
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="centerpro-welcome"]')) seen.welcome = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await transport(page, () => current, async (route, path) => {
    expect(path).toBe('/api/auth/login');
    expect(route.request().postDataJSON()).toEqual({ username: 'CENTER_QR', password: 'Test-display-only-73', remember: true });
    current = snapshot();
    await route.fulfill({ json: current });
  });
  await page.goto('/login');
  await page.getByLabel('اسم المستخدم', { exact: false }).fill('CENTER_QR');
  await page.getByLabel('كلمة المرور', { exact: false }).fill('Test-display-only-73');
  await page.getByLabel('ابقني مسجلاً').check();
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: false }).click();
  await expect(page).toHaveURL(/\/attendance-display$/);
  await expect(page.getByTestId('centerpro-welcome')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __displayLogin: { welcome: boolean } }).__displayLogin.welcome)).toBe(false);
  await expect(page.getByText('لا يوجد يوم حضور مفتوح حالياً.', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/attendance-display$/);
});

test('QR session cannot open admin, employee, settings, or calculator navigation', async ({ page }) => {
  await transport(page, () => snapshot());
  for (const path of ['/dashboard', '/employees', '/settings', '/payroll', '/employee', '/employee/scan', '/calculator?returnTo=/settings']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/attendance-display$/);
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
  }
});

test('owner creates the account after acknowledgement and can disable it without resending a password', async ({ page }) => {
  let current = snapshot(owner);
  let pending: Route | undefined;
  const commands: Record<string, unknown>[] = [];
  await transport(page, () => current, async (route, path) => {
    expect(path).toBe('/api/auth/qr-display');
    commands.push(route.request().postDataJSON());
    pending = route;
  });
  await page.goto('/settings');
  await page.getByLabel('اسم المستخدم', { exact: false }).fill('CENTER_TABLET');
  await page.getByRole('button', { name: 'إنشاء حساب شاشة الحضور', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('من 6 أحرف');
  expect(commands).toHaveLength(0);
  await page.getByLabel('كلمة المرور', { exact: false }).fill('Test-display-only-73');
  await page.getByRole('button', { name: 'إنشاء حساب شاشة الحضور', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(page.getByRole('button', { name: 'إنشاء حساب شاشة الحضور', exact: true })).toBeDisabled();
  expect(commands[0]).toEqual({ revision: 11, username: 'CENTER_TABLET', password: 'Test-display-only-73', active: true });
  current = { ...current, revision: 12, qrDisplayConfigured: true, qrDisplayUsername: 'CENTER_TABLET', qrDisplayActive: true };
  await pending!.fulfill({ json: current });
  await expect(page.getByText('تم إنشاء حساب شاشة الحضور.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('كلمة مرور جديدة (اختياري)', { exact: false })).toHaveValue('');
  await page.getByLabel('الحساب نشط', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'حفظ حساب شاشة الحضور', exact: true }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toEqual({ revision: 12, username: 'CENTER_TABLET', active: false });
  current = { ...current, revision: 13, qrDisplayActive: false };
  await pending!.fulfill({ json: current });
  await expect(page.getByText('تم تحديث حساب شاشة الحضور.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('الحساب نشط', { exact: true })).not.toBeChecked();
});

test('concurrent account changes preserve the draft and require review before a retry', async ({ page }) => {
  let current = { ...snapshot(owner), qrDisplayConfigured: true, qrDisplayUsername: 'CENTER_QR', qrDisplayActive: true };
  const commands: Record<string, unknown>[] = [];
  await transport(page, () => current, async (route, path) => {
    expect(path).toBe('/api/auth/qr-display');
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) {
      current = { ...current, revision: 12, qrDisplayUsername: 'OTHER_ADMIN_CHANGE', qrDisplayActive: false };
      return route.fulfill({ status: 409, json: { error: 'تغيّرت البيانات من جهاز آخر.' } });
    }
    current = { ...current, revision: 13, qrDisplayUsername: 'REVIEWED_NAME' };
    return route.fulfill({ json: current });
  });
  await page.goto('/settings');
  await page.getByLabel('اسم المستخدم', { exact: false }).fill('UNCONFIRMED_DRAFT');
  const save = page.getByRole('button', { name: 'حفظ حساب شاشة الحضور', exact: true });
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
  await expect(page.getByLabel('اسم المستخدم', { exact: false })).toHaveValue('UNCONFIRMED_DRAFT');
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('أعد فتح النموذج');
  expect(commands).toHaveLength(1);
  await page.getByRole('button', { name: 'إلغاء تعديلات حساب الشاشة', exact: true }).click();
  await expect(page.getByLabel('اسم المستخدم', { exact: false })).toHaveValue('OTHER_ADMIN_CHANGE');
  await expect(page.getByLabel('الحساب نشط', { exact: true })).not.toBeChecked();
  await page.getByLabel('اسم المستخدم', { exact: false }).fill('REVIEWED_NAME');
  await save.click();
  await expect(page.getByText('تم تحديث حساب شاشة الحضور.', { exact: true })).toBeVisible();
  expect(commands[1]).toEqual({ revision: 12, username: 'REVIEWED_NAME', active: false });
});

for (const firstSave of ['qr', 'center'] as const) {
  test(`saving ${firstSave} settings preserves conflict protection for the other edited form`, async ({ page }) => {
    await page.clock.install();
    let current = { ...snapshot(owner), qrDisplayConfigured: true, qrDisplayUsername: 'CENTER_QR', qrDisplayActive: true };
    let reads = 0;
    const commands: Array<{ path: string; body: Record<string, unknown> }> = [];
    await transport(page, () => { reads += 1; return current; }, async (route, path) => {
      const body = route.request().postDataJSON();
      commands.push({ path, body });
      expect(['/api/auth/qr-display', '/api/mutations']).toContain(path);
      if (body.revision !== current.revision) return route.fulfill({ status: 409, json: { error: 'تغيّرت البيانات من جهاز آخر.' } });
      current = {
        ...current, revision: current.revision + 1,
        ...(path === '/api/auth/qr-display'
          ? { qrDisplayUsername: body.username as string }
          : { data: { ...current.data, settings: body.settings as DemoData['settings'] } }),
      };
      return route.fulfill({ json: current });
    });
    await page.goto('/settings');
    await page.getByLabel('اسم المركز', { exact: false }).fill('مسودة اسم المركز');
    await page.getByLabel('اسم المستخدم', { exact: false }).fill('TABLET_DRAFT');
    const centerSave = page.getByRole('button', { name: 'حفظ الإعدادات', exact: true });
    const qrSave = page.getByRole('button', { name: 'حفظ حساب شاشة الحضور', exact: true });
    await (firstSave === 'qr' ? qrSave : centerSave).click();
    await expect(page.getByText(firstSave === 'qr' ? 'تم تحديث حساب شاشة الحضور.' : 'تم حفظ الإعدادات وتسجيل التغيير في سجل العمليات.', { exact: true })).toBeVisible();

    current = {
      ...current, revision: 13,
      ...(firstSave === 'qr'
        ? { data: { ...current.data, settings: { ...current.data.settings, centerName: 'تعديل مسؤول آخر' } } }
        : { qrDisplayUsername: 'OTHER_TABLET' }),
    };
    const readsBeforePoll = reads;
    await page.clock.fastForward(15_001);
    await expect.poll(() => reads).toBeGreaterThan(readsBeforePoll);
    await expect(page.getByLabel('اسم المركز', { exact: false })).toHaveValue('مسودة اسم المركز');
    await expect(page.getByLabel('اسم المستخدم', { exact: false })).toHaveValue('TABLET_DRAFT');
    await (firstSave === 'qr' ? centerSave : qrSave).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('تغيّرت البيانات من جهاز آخر');
    expect(commands.map(command => command.body.revision)).toEqual([11, 12]);
    expect(commands.map(command => command.path)).toEqual(firstSave === 'qr'
      ? ['/api/auth/qr-display', '/api/mutations'] : ['/api/mutations', '/api/auth/qr-display']);
    expect(commands.every(command => !Object.hasOwn(command.body, 'draftForm'))).toBe(true);
    expect(current.revision).toBe(13);
  });
}

test('display follows open and closed workdays, rotates QR, and removes access after revocation', async ({ page }) => {
  await page.clock.install();
  let current = snapshot();
  let issued = 0;
  await transport(page, () => current, async (route, path) => {
    expect(path).toBe('/api/qr');
    await issueQr(page, route, `display-token-${++issued}`);
  });
  await page.goto('/attendance-display');
  await expect(page.getByText('لا يوجد يوم حضور مفتوح حالياً.', { exact: true })).toBeVisible();
  current = { ...openSnapshot(), revision: 12 };
  await page.clock.fastForward(15_001);
  await expect(qrImage(page)).toBeVisible();
  const firstQr = await qrImage(page).innerHTML();
  await page.clock.fastForward(45_001);
  await expect.poll(() => issued).toBeGreaterThan(1);
  await expect(qrImage(page)).toBeVisible();
  await expect.poll(() => qrImage(page).innerHTML()).not.toBe(firstQr);
  current = { ...snapshot(), revision: 13 };
  await page.clock.fastForward(15_001);
  await expect(page.getByText('لا يوجد يوم حضور مفتوح حالياً.', { exact: true })).toBeVisible();
  await expect(qrImage(page)).toHaveCount(0);
  current = { ...snapshot(null), revision: 14 };
  await page.clock.fastForward(15_001);
  await expect(page.getByText('شاشة الحضور غير متاحة لهذا الحساب', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toHaveCount(0);
});

test('expired QR is hidden while renewal is pending and returns only after a fresh server token', async ({ page }) => {
  await page.clock.install();
  let issued = 0;
  let pending: Route | undefined;
  await transport(page, openSnapshot, async (route, path) => {
    expect(path).toBe('/api/qr');
    if (++issued === 1) await issueQr(page, route, 'initial-token');
    else pending = route;
  });
  await page.goto('/attendance-display');
  await expect(qrImage(page)).toBeVisible();
  await page.clock.fastForward(46_001);
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(qrImage(page)).toHaveCount(0);
  await issueQr(page, pending!, 'renewed-token');
  await expect(qrImage(page)).toBeVisible();
});

test('display logout remains usable after a failed request and waits for successful server logout', async ({ page }) => {
  let current = snapshot();
  let count = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await transport(page, () => current, async (route, path) => {
    expect(path).toBe('/api/auth/logout');
    if (++count === 1) return route.fulfill({ status: 503, json: { error: 'تعذر إنهاء الجلسة الآن.' } });
    current = snapshot(null);
    return route.fulfill({ json: current });
  });
  await page.goto('/attendance-display');
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page.getByText('تعذر إنهاء الجلسة الآن.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/attendance-display$/);
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('display offers recovery when its first state read fails', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/state', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'قاعدة البيانات غير متاحة حالياً.' } })
    : route.fulfill({ json: snapshot() }));
  await page.goto('/attendance-display');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('قاعدة البيانات غير متاحة');
  unavailable = false;
  await page.getByRole('button', { name: 'إعادة الاتصال', exact: true }).click();
  await expect(page.getByText('لا يوجد يوم حضور مفتوح حالياً.', { exact: true })).toBeVisible();
});

test('QR display fits phone and iPad portrait and landscape with accessible controls', async ({ page }, testInfo) => {
  await transport(page, openSnapshot, async (route, path) => {
    expect(path).toBe('/api/qr');
    await issueQr(page, route, 'responsive-display-token');
  });
  await page.goto('/attendance-display');
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await expect(qrImage(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الخروج', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ملء الشاشة', exact: true })).toBeVisible();
    const box = await qrImage(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(280);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`qr-display-${viewport.width}.png`), fullPage: true });
  }
});
