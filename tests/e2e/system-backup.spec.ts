import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { AuthStore } from '../../src/lib/local-auth';
import type { DemoData } from '../../src/lib/types';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from '../../src/lib/evaluations';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY } from '../../src/lib/preview-config';
import { createPopulatedTestData } from '../fixtures/populated-data';
import {
  test, expect, seedPopulatedPreview, loginAccount, gotoPreview, readPreviewData,
  AUTH_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, TEST_PASSWORD,
} from './helpers/preview';

interface BackupFile {
  format: string;
  formatVersion: number;
  payload: {
    dataSchemaVersion: number;
    storageVersion: number;
    exportedAt: string;
    source: { origin: string; revision: number };
    preferences: { theme: string | null };
    data: DemoData;
    authentication: { credentials: AuthStore; passwordKdf: Record<string, unknown> };
  };
  integrity: { algorithm: string; serialization: string; digest: string };
}

function completeBackupFixture(): DemoData {
  const data = createPopulatedTestData();
  data.employees[0].photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6fzkAAAAASUVORK5CYII=';
  data.employees[0].notes = 'تفاصيل موظف محفوظة للانتقال إلى قاعدة البيانات';
  data.settings = { centerName: 'مركز النسخة الكاملة للاختبار', qrInterval: 60 };
  const timestamp = '2026-09-20T12:00:00.000Z';
  data.evaluationSeasons.push({ id: 'backup-season', name: 'الموسم المؤرشف', startDate: '2026-09-01', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationCycles.push({ id: 'backup-cycle', seasonId: 'backup-season', name: 'دورة الاختبار المؤرشفة', state: 'OPEN', openedAt: timestamp, openedBy: 'مدير النظام' });
  data.evaluationExams.push({ id: 'backup-exam', cycleId: 'backup-cycle', name: 'امتحان محفوظ', date: '2026-09-18', note: 'ملاحظة الامتحان', state: 'CLOSED', createdAt: timestamp, createdBy: 'مدير النظام', closedAt: timestamp, closedBy: 'مدير النظام' });
  data.examEvaluations.push({ id: 'backup-evaluation', examId: 'backup-exam', employeeId: data.employees[0].id, papers: 213, correctionErrors: 2, behaviorErrors: 1, note: 'تفاصيل التدقيق الأصلية', createdAt: timestamp, createdBy: 'مدقق الاختبار', updatedAt: timestamp, updatedBy: 'مدقق الاختبار' });
  const cycle = data.evaluationCycles[0];
  cycle.snapshot = buildEvaluationCycleSnapshot(data, cycle.id);
  Object.assign(cycle, { state: 'ARCHIVED', closedAt: timestamp, closedBy: 'مدير النظام' });
  const season = data.evaluationSeasons[0];
  season.snapshot = buildEvaluationSeasonSnapshot(data, season.id);
  Object.assign(season, { state: 'ARCHIVED', endDate: '2026-09-20', closedAt: timestamp, closedBy: 'مدير النظام' });
  return data;
}

async function browserStorage(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

async function downloadBackup(page: Page): Promise<{ backup: BackupFile; text: string; filename: string }> {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تحميل نسخة احتياطية كاملة', exact: true }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  return { backup: JSON.parse(text), text, filename: download.suggestedFilename() };
}

test.describe('Full system backup for future database migration', () => {
  test.beforeEach(async ({ page }) => { await seedPopulatedPreview(page, completeBackupFixture()); });

  test('mobile owner downloads every record, archived detail and password hash without sessions or storage changes', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAccount(page, 'SYSTEM', true);
    await gotoPreview(page, '/settings');
    await page.getByRole('button', { name: 'تفعيل الوضع الداكن', exact: true }).click();
    await page.evaluate(() => {
      localStorage.setItem('unrelated-private-token', 'never-export-local-token');
      sessionStorage.setItem('unrelated-private-token', 'never-export-session-token');
    });
    const before = await browserStorage(page);
    const data = await readPreviewData(page);
    const stored = JSON.parse(before.session[PREVIEW_STORAGE_KEY]);
    expect(before.local[PREVIEW_PERSISTENT_STORAGE_KEY]).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'نسخة احتياطية كاملة', exact: true })).toBeVisible();
    const { backup, text, filename } = await downloadBackup(page);
    expect(filename).toMatch(/^centerpro-.*\.json$/i);
    expect(backup).toMatchObject({ format: 'centerpro-system-backup', formatVersion: 1, payload: { dataSchemaVersion: 1, storageVersion: PREVIEW_STORAGE_VERSION, source: { origin: 'http://127.0.0.1:3000', revision: stored.revision }, preferences: { theme: 'dark' } } });
    expect(Number.isFinite(Date.parse(backup.payload.exportedAt))).toBe(true);
    expect(backup.payload.data).toEqual(data);
    expect(Object.keys(backup.payload.data).sort()).toEqual(Object.keys(data).sort());
    for (const [key, value] of Object.entries(backup.payload.data)) {
      if (key !== 'settings') expect(Array.isArray(value) && value.length > 0, `${key} must be represented`).toBe(true);
    }
    expect(backup.payload.data.employees.find(employee => !employee.active)).toBeDefined();
    expect(backup.payload.data.employees[0].photo).toBe(data.employees[0].photo);
    expect(backup.payload.data.months.find(month => month.state === 'ARCHIVED')?.sourceSnapshot?.attendance.length).toBeGreaterThan(0);
    expect(backup.payload.data.evaluationCycles[0].snapshot?.exams[0].rows[0].score).toBe(200);
    expect(backup.payload.data.evaluationSeasons[0].snapshot?.rows[0].score).toBe(200);
    expect(backup.payload.authentication.credentials).toEqual(JSON.parse(before.local[AUTH_STORAGE_KEY]));
    expect(backup.payload.authentication.passwordKdf).toMatchObject({ algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 150_000, saltBytes: 16, derivedKeyBytes: 32, encoding: 'base64', passwordEncoding: 'UTF-8', passwordNormalization: 'none' });
    expect(backup.integrity).toEqual({ algorithm: 'SHA-256', serialization: 'JSON.stringify(payload)', digest: createHash('sha256').update(JSON.stringify(backup.payload)).digest('hex') });
    for (const excluded of [TEST_PASSWORD, 'never-export-local-token', 'never-export-session-token', '"session":', '"remembered":', '"authVersion":']) expect(text).not.toContain(excluded);
    expect(await browserStorage(page)).toEqual(before);
    await expect(page.getByText('تم تجهيز النسخة الاحتياطية. تأكد من حفظ الملف على جهازك.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'نسخة احتياطية كاملة', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('full-backup-mobile.png') });
  });

  test('backup includes current saved-in-app changes even when browser data persistence is full', async ({ page }) => {
    await loginAccount(page, 'SYSTEM', true);
    await gotoPreview(page, '/settings');
    const before = await browserStorage(page);
    const originalData = await readPreviewData(page);
    await page.evaluate(keys => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (keys.includes(key)) throw new DOMException('Test-only exhausted storage', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, [PREVIEW_STORAGE_KEY, PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY]);
    const newestName = 'أحدث اسم محفوظ في النظام قبل التحميل';
    await page.getByLabel('اسم المركز', { exact: false }).fill(newestName);
    await page.getByRole('button', { name: 'حفظ الإعدادات', exact: true }).click();
    await expect(page.getByRole('button', { name: 'حفظ الإعدادات', exact: true })).toBeDisabled();
    expect(await browserStorage(page)).toEqual(before);
    expect((await readPreviewData(page)).settings.centerName).toBe(originalData.settings.centerName);
    const { backup } = await downloadBackup(page);
    expect(backup.payload.data.settings).toEqual({ ...originalData.settings, centerName: newestName });
    expect(backup.payload.source.revision).toBeGreaterThan(JSON.parse(before.session[PREVIEW_STORAGE_KEY]).revision);
    expect(backup.payload.data.audit[0]).toMatchObject({ action: 'تعديل إعدادات النظام', newValues: { centerName: newestName } });
    expect(backup.payload.data.audit.slice(1)).toEqual(originalData.audit);
    expect({ ...backup.payload.data, settings: originalData.settings, audit: originalData.audit }).toEqual(originalData);
    expect(backup.payload.authentication.credentials).toEqual(JSON.parse(before.local[AUTH_STORAGE_KEY]));
    expect(await browserStorage(page)).toEqual(before);
  });

  test('corrupt or inaccessible credential storage displays an error and never downloads an incomplete backup', async ({ page }) => {
    await loginAccount(page);
    await gotoPreview(page, '/settings');
    const before = await browserStorage(page);
    const downloads: string[] = [];
    page.on('download', download => { downloads.push(download.suggestedFilename()); });
    const backupCard = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'نسخة احتياطية كاملة', exact: true }) });
    await page.evaluate(key => { localStorage.setItem(key, '{invalid-json'); }, AUTH_STORAGE_KEY);
    await page.getByRole('button', { name: 'تحميل نسخة احتياطية كاملة', exact: true }).click();
    await expect(backupCard.getByRole('alert')).toBeVisible();
    expect(downloads).toEqual([]);
    expect(await readPreviewData(page)).toEqual(JSON.parse(before.session[PREVIEW_STORAGE_KEY]).data);
    await page.evaluate(({ key, value }) => {
      localStorage.setItem(key, value);
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (name) {
        if (this === localStorage && name === key) throw new DOMException('Test-only blocked storage', 'SecurityError');
        return original.call(this, name);
      };
    }, { key: AUTH_STORAGE_KEY, value: before.local[AUTH_STORAGE_KEY] });
    await page.getByRole('button', { name: 'تحميل نسخة احتياطية كاملة', exact: true }).click();
    await expect(backupCard.getByRole('alert')).toBeVisible();
    expect(downloads).toEqual([]);
    expect(await readPreviewData(page)).toEqual(JSON.parse(before.session[PREVIEW_STORAGE_KEY]).data);
    expect(await page.evaluate(key => localStorage[key], AUTH_STORAGE_KEY)).toBe(before.local[AUTH_STORAGE_KEY]);
  });

  test('export is restricted to active super admins and stops if their credential changes during preparation', async ({ page }) => {
    for (const id of ['CP-0013', 'CP-0001']) {
      await loginAccount(page, id);
      await gotoPreview(page, '/settings');
      await expect(page).toHaveURL(id === 'CP-0013' ? /\/dashboard$/ : /\/employee$/);
      await expect(page.getByRole('button', { name: 'تحميل نسخة احتياطية كاملة', exact: true })).toHaveCount(0);
    }
    await loginAccount(page, 'CP-0012');
    await gotoPreview(page, '/settings');
    const before = await browserStorage(page);
    const { backup } = await downloadBackup(page);
    expect(backup.payload.data).toEqual(await readPreviewData(page));
    expect(backup.payload.authentication.credentials).toEqual(JSON.parse(before.local[AUTH_STORAGE_KEY]));
    expect(await browserStorage(page)).toEqual(before);

    const downloadsAfterRevocation: string[] = [];
    page.on('download', download => { downloadsAfterRevocation.push(download.suggestedFilename()); });
    await page.evaluate(() => {
      const state = window as typeof window & { backupDigestStarted?: boolean; releaseBackupDigest?: () => void };
      const original = crypto.subtle.digest;
      crypto.subtle.digest = async function (algorithm, data) {
        const result = await original.call(this, algorithm, data);
        state.backupDigestStarted = true;
        await new Promise<void>(resolve => { state.releaseBackupDigest = resolve; });
        return result;
      };
    });
    await page.getByRole('button', { name: 'تحميل نسخة احتياطية كاملة', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { backupDigestStarted?: boolean }).backupDigestStarted)).toBe(true);
    await page.evaluate(key => {
      const auth = JSON.parse(localStorage.getItem(key)!);
      auth.employees['CP-0012'].version += 1;
      localStorage.setItem(key, JSON.stringify(auth));
      (window as typeof window & { releaseBackupDigest?: () => void }).releaseBackupDigest?.();
    }, AUTH_STORAGE_KEY);
    await expect(page.getByRole('alert')).toContainText('انتهت الجلسة');
    expect(downloadsAfterRevocation).toEqual([]);
    expect(await readPreviewData(page)).toEqual(backup.payload.data);
  });
});
