import { createHash, pbkdf2Sync, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_PASSWORD_KDF, AUTH_STORAGE_KEY, createCredential, readAuthStore, readAuthStoreForBackup, type AuthStore } from '../../src/lib/local-auth';
import { createInitialData } from '../../src/lib/mock-data';
import { PREVIEW_STORAGE_VERSION } from '../../src/lib/preview-config';
import { createSystemBackup, parseSystemBackup, serializeSystemBackup, systemBackupFilename, type CreateSystemBackupInput, type SystemBackup } from '../../src/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';

const exportedAt = '2026-10-12T18:08:21.123Z';
let values: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
beforeEach(() => {
  values = new Map();
  storage = { getItem: key => values.get(key) ?? null,
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn(key => { values.delete(key); }),
  };
  vi.stubGlobal('window', { localStorage: storage, crypto: webcrypto });
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function input(overrides: Partial<CreateSystemBackupInput> = {}): CreateSystemBackupInput {
  return { data: createInitialData(), auth: { schema: 1, system: null, employees: {} },
    theme: 'dark', revision: 123, origin: 'https://centerpro-sigma.vercel.app', exportedAt, ...overrides,
  };
}
function rehash(backup: SystemBackup) {
  backup.integrity.digest = createHash('sha256').update(JSON.stringify(backup.payload), 'utf8').digest('hex');
  return JSON.stringify(backup);
}
function allCollectionsFixture() {
  const data = createPopulatedTestData();
  const employeeId = data.employees[0].id;
  data.employees[0].photo = 'data:image/png;base64,cGhvdG8=';
  data.settings.centerName = 'مركز حسن فلاح';
  const row = { employeeId, employeeName: 'مصححة محفوظة', employeeCode: 'CP-0001', papers: 777,
    correctionErrors: 2, behaviorErrors: 3, examsEvaluated: 1, score: 758, accuracy: 99.7 };
  data.evaluationSeasons = [{ id: 'season-old', name: 'موسم مؤرشف', startDate: '2026-01-01', endDate: '2026-09-30',
    state: 'ARCHIVED', openedAt: exportedAt, openedBy: 'المالك', closedAt: exportedAt, closedBy: 'المالك',
    snapshot: { rows: [{ ...row, cyclesEvaluated: 2, attendanceDays: 16, averagePapersPerDay: 48.5625 }], cycleIds: ['cycle-old'] } }];
  data.evaluationCycles = [{ id: 'cycle-old', seasonId: 'season-old', name: 'دورة مغلقة', state: 'ARCHIVED',
    openedAt: exportedAt, openedBy: 'المالك', closedAt: exportedAt, closedBy: 'المالك',
    snapshot: { rows: [row], exams: [{ id: 'exam-old', name: 'الفصل الثالث', date: '2026-09-20', rows: [row] }] } }];
  data.evaluationExams = [{ id: 'exam-old', cycleId: 'cycle-old', name: 'الفصل الثالث', date: '2026-09-20',
    note: 'سجل سابق', state: 'CLOSED', createdBy: 'المالك', createdAt: exportedAt, closedBy: 'المالك', closedAt: exportedAt }];
  data.examEvaluations = [{ id: 'evaluation-old', examId: 'exam-old', employeeId, papers: 777,
    correctionErrors: 2, behaviorErrors: 3, note: 'ملاحظة التدقيق', createdBy: 'مدقق', createdAt: exportedAt,
    updatedBy: 'مدقق', updatedAt: exportedAt }];
  return data;
}

describe('complete portable system backups', () => {
  it('roundtrips every collection, photos, inactive accounts, nested archives and evaluation history without recomputation', async () => {
    const data = allCollectionsFixture();
    // Preserve a stored historical amount even if current salary rules differ.
    data.months[1].snapshots[data.employees[0].id].finalSalary = 123456;
    const auth: AuthStore = { schema: 1,
      system: { ...await createCredential('owner-password'), username: 'OwnerCasePreserved' },
      employees: { [data.employees[0].id]: await createCredential('employee-password'),
        'old-account-no-profile': await createCredential('old-password') },
    };
    values.set(AUTH_STORAGE_KEY, JSON.stringify(auth));
    values.set('current-session', JSON.stringify({ token: 'NEVER-EXPORT-SESSION' }));
    const before = Array.from(values);
    const backup = await createSystemBackup(input({ data, auth: readAuthStoreForBackup() }));
    const serialized = serializeSystemBackup(backup);
    const parsed = await parseSystemBackup(serialized);
    expect(parsed).toEqual(backup);
    expect(parsed.payload.data).toEqual(JSON.parse(JSON.stringify(data)));
    expect(parsed.payload.authentication.credentials).toEqual(auth);
    expect(parsed.payload.data.employees.find(employee => !employee.active)).toBeDefined();
    expect(parsed.payload.data.employees[0].photo).toBe(data.employees[0].photo);
    expect(parsed.payload.data.months[1].sourceSnapshot).toEqual(data.months[1].sourceSnapshot);
    expect(parsed.payload.data.months[1].snapshots[data.employees[0].id].finalSalary).toBe(123456);
    for (const [key, collection] of Object.entries(parsed.payload.data)) {
      if (key !== 'settings') expect((collection as unknown[]).length, key).toBeGreaterThan(0);
    }
    expect(parsed.payload.storageVersion).toBe(PREVIEW_STORAGE_VERSION);
    expect(parsed.payload.source).toEqual({ origin: 'https://centerpro-sigma.vercel.app', revision: 123 });
    expect(parsed.payload.preferences.theme).toBe('dark');
    expect(parsed.payload.authentication.passwordKdf).toEqual(AUTH_PASSWORD_KDF);
    expect(backup.integrity.digest).toBe(createHash('sha256').update(JSON.stringify(backup.payload)).digest('hex'));
    for (const secret of ['owner-password', 'employee-password', 'old-password', 'NEVER-EXPORT-SESSION']) expect(serialized).not.toContain(secret);
    expect(Array.from(values)).toEqual(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('exports enough KDF metadata for a future server to verify exact UTF-8 passwords independently', async () => {
    const password = '  كلمة-المرور e\u0301  ';
    const credential = await createCredential(password, 7);
    const backup = await createSystemBackup(input({ auth: { schema: 1, system: null, employees: { employee: credential } } }));
    const parsed = await parseSystemBackup(serializeSystemBackup(backup));
    const { passwordKdf: kdf, credentials } = parsed.payload.authentication;
    const exported = credentials.employees.employee;
    expect(exported.version).toBe(8);
    const derive = (candidate: string) => pbkdf2Sync(Buffer.from(candidate, 'utf8'), Buffer.from(exported.salt, 'base64'),
      kdf.iterations, kdf.derivedKeyBytes, kdf.hash.toLowerCase().replace('-', '')).toString('base64');
    expect(derive(password)).toBe(exported.hash);
    expect(derive(password.trim())).not.toBe(exported.hash);
    expect(derive(password.normalize('NFC'))).not.toBe(exported.hash);
  });

  it('captures a detached snapshot before hashing and preserves additional JSON record fields', async () => {
    const data = allCollectionsFixture();
    Object.assign(data.employees[0], { priorRecordField: { nested: ['أرشيف', null, 42] } });
    const expected = JSON.parse(JSON.stringify(data));
    const pending = createSystemBackup(input({ data }));
    data.employees[0].name = 'تعديل بعد بدء النسخ';
    data.audit.length = 0;
    const backup = await pending;
    expect(backup.payload.data).toEqual(expected);
    backup.payload.data.employees[0].name = 'تعديل النسخة';
    expect(data.employees[0].name).toBe('تعديل بعد بدء النسخ');
  });

  it('rejects tampered valid data, altered KDF metadata, unsupported versions and truncated JSON', async () => {
    const backup = await createSystemBackup(input());
    const tampered = structuredClone(backup);
    tampered.payload.data.settings.centerName = 'changed';
    await expect(parseSystemBackup(JSON.stringify(tampered))).rejects.toThrow('سلامة');
    const wrongKdf = structuredClone(backup);
    Object.assign(wrongKdf.payload.authentication.passwordKdf, { iterations: 1 });
    await expect(parseSystemBackup(rehash(wrongKdf))).rejects.toThrow('إصدارها');
    const wrongVersion = structuredClone(backup);
    Object.assign(wrongVersion, { formatVersion: 2 });
    await expect(parseSystemBackup(JSON.stringify(wrongVersion))).rejects.toThrow('إصدارها');
    await expect(parseSystemBackup(JSON.stringify(backup).slice(0, -10))).rejects.toThrow('JSON');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects malformed nested history even if its digest was recomputed', async () => {
    const backup = await createSystemBackup(input({ data: allCollectionsFixture() }));
    Object.assign(backup.payload.data.months[1].sourceSnapshot!.attendance[0], { latenessSeconds: 'lost-number' });
    await expect(parseSystemBackup(rehash(backup))).rejects.toThrow('تنسيق');
    const missingCollection = await createSystemBackup(input());
    Reflect.deleteProperty(missingCollection.payload.data, 'evaluationSeasons');
    await expect(parseSystemBackup(rehash(missingCollection))).rejects.toThrow('تنسيق');
  });

  it('rejects non-JSON values rather than silently dropping or changing them', async () => {
    const malformedNumber = input();
    malformedNumber.data.settings.qrInterval = Number.NaN;
    await expect(createSystemBackup(malformedNumber)).rejects.toThrow('كاملة');
    const malformedExtra = input();
    Object.assign(malformedExtra.data.settings, { lostCallback: () => true });
    await expect(createSystemBackup(malformedExtra)).rejects.toThrow('كاملة');
    const malformedArray = input();
    Object.assign(malformedArray.data.settings, { lostArrayValue: [undefined] });
    await expect(createSystemBackup(malformedArray)).rejects.toThrow('كاملة');
  });

  it('supports empty installations and creates portable unique timestamp filenames', async () => {
    const backup = await createSystemBackup(input({ theme: null, revision: 0 }));
    expect((await parseSystemBackup(serializeSystemBackup(backup))).payload.data).toEqual(createInitialData());
    expect(systemBackupFilename(exportedAt)).toBe('CenterPro-backup-2026-10-12T18-08-21-123Z.json');
    expect(() => systemBackupFilename('invalid')).toThrow('وقت');
  });
});

describe('strict credential reads for backup', () => {
  it('does not silently drop even one invalid account, unlike the tolerant login read', async () => {
    const valid = await createCredential('password');
    const raw = JSON.stringify({ schema: 1, system: null, employees: { valid, corrupt: { ...valid, hash: 'broken' } } });
    values.set(AUTH_STORAGE_KEY, raw);
    expect(Object.keys(readAuthStore().employees)).toEqual(['valid']);
    expect(() => readAuthStoreForBackup()).toThrow('غير صالحة');
    expect(values.get(AUTH_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid-json', 'null', '{"schema":2,"system":null,"employees":{}}', '{"schema":1,"system":null,"employees":[]}'])('fails closed on corrupted storage without modifying it: %s', raw => {
    values.set(AUTH_STORAGE_KEY, raw);
    expect(() => readAuthStoreForBackup()).toThrow();
    expect(values.get(AUTH_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('fails on unavailable storage and rejects unexpected credential plaintext or session fields', async () => {
    const valid = await createCredential('password');
    for (const field of ['password', 'session', 'remembered']) {
      values.set(AUTH_STORAGE_KEY, JSON.stringify({ schema: 1, system: null, employees: { employee: { ...valid, [field]: 'must-not-export' } } }));
      expect(() => readAuthStoreForBackup()).toThrow();
    }
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => readAuthStoreForBackup()).toThrow('قراءة');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('represents absent credentials explicitly and never writes an empty replacement', () => {
    expect(readAuthStoreForBackup()).toEqual({ schema: 1, system: null, employees: {} });
    expect(values.size).toBe(0);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
