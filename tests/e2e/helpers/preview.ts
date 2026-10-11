import { createHash, pbkdf2Sync } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { createPopulatedTestData } from '../../fixtures/populated-data';
import { PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN, PREVIEW_SYSTEM_USERNAME } from '../../../src/lib/preview-config';
import { AUTH_STORAGE_KEY, type AuthStore, type StoredCredential } from '../../../src/lib/local-auth';
import type { DemoData, DemoSession } from '../../../src/lib/types';

export { expect, AUTH_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION };
export const PREVIEW_TEST_TIME = new Date('2026-09-28T11:00:00.000Z');
export const WELCOME_PERIOD_MS = 3_000;
export const TEST_PASSWORD = 'Preview-not-a-real-password';
export const SYSTEM_TEST_SESSION: DemoSession = { ...PREVIEW_SYSTEM_ADMIN, authVersion: 1 };

// The clock advances the real welcome experience; no application bypass is used.
// Populated records are deliberately opt-in so onboarding exercises clean startup.
export const test = base.extend<{ previewClock: void }>({
  previewClock: [async ({ page }, use) => {
    await page.clock.install({ time: PREVIEW_TEST_TIME });
    await use();
  }, { auto: true }],
});

export async function waitForWelcome(page: Page) {
  const welcome = page.getByTestId('centerpro-welcome');
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute('data-timer-started', 'true');
  return welcome;
}

export async function finishWelcome(page: Page) {
  const welcome = await waitForWelcome(page);
  await page.clock.fastForward(WELCOME_PERIOD_MS);
  await expect(welcome).toBeHidden();
}

export async function gotoPreview(page: Page, url: string) {
  return page.goto(url);
}

/** Fill the real login/setup form; callers may inspect the splash before advancing it. */
export async function fillLoginCredentials(page: Page, username = PREVIEW_SYSTEM_USERNAME, password = TEST_PASSWORD) {
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  await page.getByLabel(/^اسم المستخدم/).fill(username);
  await page.getByLabel(/^كلمة المرور/).fill(password);
  const confirm = page.getByLabel(/^تأكيد كلمة المرور/);
  if (await confirm.isVisible()) await confirm.fill(password);
}

export async function submitLogin(page: Page) {
  await page.locator('form button[type="submit"]').click();
}

export async function loginAccount(page: Page, id = 'SYSTEM', remember = false, password = TEST_PASSWORD) {
  await gotoPreview(page, '/login?switch=1');
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  const data = await readPreviewData(page);
  const employee = id === 'SYSTEM' ? undefined : data.employees.find(account => account.id === id);
  if (id !== 'SYSTEM' && !employee) throw new Error(`No preview account exists for ${id}.`);
  const username = employee?.username ?? await page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).system?.username : null;
  }, AUTH_STORAGE_KEY) ?? PREVIEW_SYSTEM_USERNAME;
  await fillLoginCredentials(page, username, password);
  await page.getByLabel('ابقني مسجلاً', { exact: true }).setChecked(remember);
  await submitLogin(page);
  await finishWelcome(page);
  await expect(page).toHaveURL(employee?.role === 'EMPLOYEE' ? /\/employee$/ : /\/dashboard$/);
}

export async function loginPreview(page: Page, role: 'المدير العام' | 'مدير العمليات' | 'موظف' = 'المدير العام') {
  if (role === 'المدير العام') return loginAccount(page);
  await gotoPreview(page, '/login?switch=1');
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
  const state = await readPreviewData(page);
  const targetRole = role === 'مدير العمليات' ? 'ADMIN' : 'EMPLOYEE';
  const target = state.employees.find(employee => employee.active && employee.role === targetRole);
  if (!target) throw new Error(`No active ${targetRole} preview account exists.`);
  return loginAccount(page, target.id);
}

const credentials = new Map<string, StoredCredential>();
function testCredential(id: string): StoredCredential {
  let credential = credentials.get(id);
  if (!credential) {
    // Test-only records use exactly the production PBKDF2 format and are verified
    // through the normal browser login. No plaintext enters application storage.
    const salt = createHash('sha256').update(`centerpro-test-credential:${id}`).digest().subarray(0, 16);
    credential = {
      salt: salt.toString('base64'),
      hash: pbkdf2Sync(TEST_PASSWORD, salt, 150_000, 32, 'sha256').toString('base64'),
      version: 1,
      updatedAt: PREVIEW_TEST_TIME.toISOString(),
    };
    credentials.set(id, credential);
  }
  return { ...credential };
}

export function createTestAuthStore(data?: DemoData): AuthStore {
  return {
    schema: 1,
    system: { ...testCredential('SYSTEM'), username: PREVIEW_SYSTEM_USERNAME },
    employees: Object.fromEntries((data?.employees ?? []).map(employee => [employee.id, testCredential(employee.id)])),
  };
}

export async function seedLocalAuth(page: Page, data?: DemoData) {
  await page.addInitScript(({ key, auth }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(auth));
  }, { key: AUTH_STORAGE_KEY, auth: createTestAuthStore(data) });
}

/** Seed only dedicated fixture scenarios, preserving all data/auth mutations on reload. */
export async function seedPopulatedPreview(page: Page, data: DemoData = createPopulatedTestData()) {
  await page.addInitScript(({ key, version, data, authKey, auth }) => {
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, JSON.stringify({ version, data, session: null }));
    }
    if (!window.localStorage.getItem(authKey)) window.localStorage.setItem(authKey, JSON.stringify(auth));
  }, { key: PREVIEW_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, data, authKey: AUTH_STORAGE_KEY, auth: createTestAuthStore(data) });
}

export async function readPreviewData(page: Page): Promise<DemoData> {
  return page.evaluate(key => {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) throw new Error('The preview store has not initialized.');
    return JSON.parse(raw).data;
  }, PREVIEW_STORAGE_KEY);
}

export async function readPreviewSession(page: Page): Promise<DemoSession | null> {
  return page.evaluate(key => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw).session : null;
  }, PREVIEW_STORAGE_KEY);
}
