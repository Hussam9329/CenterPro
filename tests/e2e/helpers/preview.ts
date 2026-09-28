import { test as base, expect, type Page } from '@playwright/test';
import { createPopulatedTestData } from '../../fixtures/populated-data';
import { PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION } from '../../../src/lib/preview-config';
import type { DemoData, DemoSession } from '../../../src/lib/types';

export { expect, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION };
export const PREVIEW_TEST_TIME = new Date('2026-09-28T11:00:00.000Z');
export const WELCOME_PERIOD_MS = 5_000;

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
  const response = await page.goto(url);
  await finishWelcome(page);
  return response;
}

export async function loginPreview(
  page: Page,
  role: 'المدير العام' | 'مدير العمليات' | 'موظف' = 'المدير العام',
) {
  await gotoPreview(page, '/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'دخول إلى المعاينة', exact: true }).click();
  await finishWelcome(page);
  await expect(page).toHaveURL(role === 'موظف' ? /\/employee$/ : /\/dashboard$/);
}

/** Seed only dedicated fixture scenarios, preserving all mutations on reload. */
export async function seedPopulatedPreview(page: Page, data: DemoData = createPopulatedTestData()) {
  await page.addInitScript(({ key, version, data }) => {
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, JSON.stringify({ version, data, session: null }));
    }
  }, { key: PREVIEW_STORAGE_KEY, version: PREVIEW_STORAGE_VERSION, data });
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
