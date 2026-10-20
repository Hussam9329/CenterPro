import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_STORAGE_KEY, clearEmployeeCredentials, configureSystemCredential, createCredential,
  normalizeUsername, readAuthStore, removeEmployeeCredential, setEmployeeCredential,
  verifyCredential, writeAuthStore, type StoredCredential,
} from '../../src/lib/local-auth';

let values: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  vi.stubGlobal('window', { localStorage: storage, crypto: webcrypto });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('browser-local password credentials', () => {
  it('uses salted PBKDF2 and verifies exact passwords without storing plaintext', async () => {
    const first = await createCredential('correct-password');
    const second = await createCredential('correct-password');
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(first.version).toBe(1);
    expect(Buffer.from(first.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(first.hash, 'base64')).toHaveLength(32);
    expect(await verifyCredential('correct-password', first)).toBe(true);
    expect(await verifyCredential('CORRECT-password', first)).toBe(false);
    expect(await verifyCredential('correct-password ', first)).toBe(false);
    expect(JSON.stringify(first)).not.toContain('correct-password');
  });

  it('normalizes usernames but does not weaken the password rule', async () => {
    expect(normalizeUsername('  CenterPro-OWNER  ')).toBe('centerpro-owner');
    await expect(createCredential('12345')).rejects.toThrow('8 أحرف');
    await expect(configureSystemCredential('  ', '123456')).rejects.toThrow('اسم المستخدم');
    expect(values.size).toBe(0);
  });

  it('sets up one owner without overwriting an already configured password', async () => {
    const first = await configureSystemCredential('  CenterPro  ', 'owner-password');
    expect(first.username).toBe('CenterPro');
    await expect(configureSystemCredential('intruder', 'replacement-password')).rejects.toThrow('مسبقاً');
    expect(readAuthStore().system).toEqual(first);
    expect(await verifyCredential('owner-password', readAuthStore().system!)).toBe(true);
  });

  it('allows only one concurrent first-owner setup to commit', async () => {
    const results = await Promise.allSettled([
      configureSystemCredential('owner-a', 'password-a'),
      configureSystemCredential('owner-b', 'password-b'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const stored = readAuthStore().system!;
    expect(await verifyCredential(stored.username === 'owner-a' ? 'password-a' : 'password-b', stored)).toBe(true);
  });

  it('merges concurrent different-account password updates instead of dropping credentials', async () => {
    const owner = await configureSystemCredential('owner', 'owner-password');
    await Promise.all([
      setEmployeeCredential('employee-a', 'password-a'),
      setEmployeeCredential('employee-b', 'password-b'),
    ]);
    const stored = readAuthStore();
    expect(stored.system).toEqual(owner);
    expect(Object.keys(stored.employees).sort()).toEqual(['employee-a', 'employee-b']);
    expect(await verifyCredential('password-a', stored.employees['employee-a'])).toBe(true);
    expect(await verifyCredential('password-b', stored.employees['employee-b'])).toBe(true);
  });

  it('increments credential versions even when same-account resets overlap', async () => {
    const versions = await Promise.all([
      setEmployeeCredential('employee', 'first-password'),
      setEmployeeCredential('employee', 'second-password'),
    ]);
    expect(versions.map(credential => credential.version).sort()).toEqual([1, 2]);
    expect(readAuthStore().employees.employee.version).toBe(2);
  });

  it('clears employee passwords while preserving the owner', async () => {
    const owner = await configureSystemCredential('owner', 'owner-password');
    await setEmployeeCredential('employee-a', 'password-a');
    await setEmployeeCredential('employee-b', 'password-b');
    removeEmployeeCredential('employee-a');
    expect(Object.keys(readAuthStore().employees)).toEqual(['employee-b']);
    clearEmployeeCredentials();
    expect(readAuthStore()).toEqual({ schema: 1, system: owner, employees: {} });
  });

  it('does not resurrect employee credentials after a reset during hashing', async () => {
    const pending = setEmployeeCredential('employee-a', 'password-a');
    clearEmployeeCredentials();
    await expect(pending).rejects.toThrow('انتهت');
    expect(readAuthStore().employees).toEqual({});
  });

  it('rechecks caller authorization immediately before asynchronous writes', async () => {
    let active = true;
    const pending = setEmployeeCredential('employee-a', 'password-a', () => active);
    active = false;
    await expect(pending).rejects.toThrow('انتهت');
    expect(readAuthStore().employees).toEqual({});
    await expect(configureSystemCredential('owner', 'owner-password', () => false)).rejects.toThrow('انتهت');
    expect(readAuthStore().system).toBeNull();
  });

  it('fails closed when localStorage acquisition throws', async () => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
    expect(() => readAuthStore()).not.toThrow();
    expect(readAuthStore().system).toBeNull();
    await expect(configureSystemCredential('owner', 'fixture-pass-1')).rejects.toThrow();
    await expect(setEmployeeCredential('employee', 'fixture-pass-1')).rejects.toThrow();
    expect(values.size).toBe(0);
  });

  it('preserves existing data and reports a full storage failure without claiming success', async () => {
    const owner = await configureSystemCredential('owner', 'owner-password');
    const before = values.get(AUTH_STORAGE_KEY);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await expect(setEmployeeCredential('employee', 'fixture-pass-1')).rejects.toThrow('Quota');
    expect(values.get(AUTH_STORAGE_KEY)).toBe(before);
    expect(readAuthStore().system).toEqual(owner);
  });

  it.each(['not-json', 'null', '{"schema":2,"system":null,"employees":{}}', '{"schema":1,"system":null,"employees":[]}'])('does not overwrite unreadable existing auth data: %s', async raw => {
    values.set(AUTH_STORAGE_KEY, raw);
    expect(readAuthStore().system).toBeNull();
    await expect(configureSystemCredential('owner', 'fixture-pass-1')).rejects.toThrow();
    await expect(setEmployeeCredential('employee', 'fixture-pass-1')).rejects.toThrow();
    expect(values.get(AUTH_STORAGE_KEY)).toBe(raw);
  });

  it('ignores malformed employee credentials while preserving valid accounts', async () => {
    const valid = await createCredential('fixture-pass-1');
    values.set(AUTH_STORAGE_KEY, JSON.stringify({ schema: 1, system: null, employees: {
      valid,
      zeroVersion: { ...valid, version: 0 },
      stringVersion: { ...valid, version: '1' },
      invalidHash: { ...valid, hash: 'bad-base64%%' },
      shortSalt: { ...valid, salt: btoa('x') },
      badDate: { ...valid, updatedAt: 'yesterday' },
      absent: null,
    } }));
    expect(readAuthStore().employees).toEqual({ valid });
    for (const malformed of [null, {}, { ...valid, hash: '' }, { ...valid, version: undefined }]) {
      expect(await verifyCredential('fixture-pass-1', malformed as StoredCredential)).toBe(false);
    }
  });

  it('does not overwrite malformed owner credentials during first setup', async () => {
    const raw = JSON.stringify({ schema: 1, system: { username: 'owner', salt: '', hash: '' }, employees: {} });
    values.set(AUTH_STORAGE_KEY, raw);
    await expect(configureSystemCredential('new-owner', 'fixture-pass-1')).rejects.toThrow();
    expect(values.get(AUTH_STORAGE_KEY)).toBe(raw);
  });

  it('is safe during server rendering without browser APIs', async () => {
    vi.stubGlobal('window', undefined);
    expect(readAuthStore()).toEqual({ schema: 1, system: null, employees: {} });
    await expect(createCredential('fixture-pass-1')).rejects.toThrow();
    expect(() => writeAuthStore(readAuthStore())).toThrow();
  });
});
