import { pbkdf2Sync, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AUTH_PASSWORD_KDF } from '@/lib/local-auth';
import type { Workday } from '@/lib/types';
import { createServerCredential, hashSessionToken, issueQr, newSessionToken, verifyQr, verifyServerPassword } from '@/server/auth-crypto';
import { ApiError, apiRoute, assertSameOrigin, jsonResponse, readJson } from '@/server/http';

afterEach(() => vi.unstubAllEnvs());
const day: Workday = { id: 'test-workday', date: '2026-10-12', startTime: '14:00', state: 'OPEN', departmentIds: ['department'], overrides: {} };
const secret = 'synthetic-test-secret-32-bytes-minimum-only';

describe('server cryptography and HTTP boundaries', () => {
  it('verifies imported browser PBKDF2 hashes and keeps new credentials browser-backup compatible', async () => {
    const password = 'كلمة مرور تجريبية فقط';
    const salt = Buffer.alloc(16, 42);
    const imported = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 20, updatedAt: '2026-10-12T00:00:00Z' };
    expect(await verifyServerPassword(password, imported)).toBe(true);
    expect(await verifyServerPassword('different', imported)).toBe(false);
    expect(await verifyServerPassword(password, null)).toBe(false);
    const generated = await createServerCredential(password, 20);
    expect(generated.version).toBe(21);
    expect(generated.salt).not.toBe(imported.salt);
    const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(Buffer.from(generated.salt, 'base64')), iterations: AUTH_PASSWORD_KDF.iterations }, material, 256);
    expect(Buffer.from(bits).toString('base64')).toBe(generated.hash);
    expect(JSON.stringify(generated)).not.toContain(password);
    await expect(createServerCredential('short')).rejects.toThrow();
    await expect(createServerCredential(password, Number.MAX_SAFE_INTEGER)).rejects.toThrow();
  });

  it('issues unguessable session tokens and never stores the bearer token as its database key', () => {
    const first = newSessionToken(); const second = newSessionToken();
    expect(first).toMatch(/^[\w-]{43}$/); expect(second).not.toBe(first);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(first)).not.toBe(first);
  });

  it('rejects forged, expired, future and cross-workday QR codes and invalidates codes when attendance configuration changes', () => {
    vi.stubEnv('SESSION_SECRET', secret);
    const now = 1_792_000_000_000;
    const issued = issueQr(day, 45, now);
    expect(issued.expiresAt).toBe(now + 45_000);
    expect(verifyQr(issued.token, day, now)).toBe(true);
    expect(verifyQr(issued.token, day, now + 44_999)).toBe(true);
    expect(verifyQr(issued.token, day, now + 45_000)).toBe(false);
    expect(verifyQr(issued.token, day, now - 1)).toBe(false);
    expect(verifyQr(issued.token, { ...day, id: 'different' }, now)).toBe(false);
    expect(verifyQr(issued.token, { ...day, startTime: '15:00' }, now)).toBe(false);
    expect(verifyQr(issued.token, { ...day, overrides: { employee: 'EXCLUDE' } }, now)).toBe(false);
    const [body, signature] = issued.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), expiresAt: now + 999_999 })).toString('base64url');
    expect(verifyQr(`${forged}.${signature}`, day, now)).toBe(false);
    expect(verifyQr(`${body}.${signature}.extra`, day, now)).toBe(false);
    expect(issueQr(day, 1, now).expiresAt).toBe(now + 30_000);
    expect(issueQr(day, 999, now).expiresAt).toBe(now + 60_000);
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => issueQr(day, 30)).toThrow();
  });

  it('rejects foreign origins, missing origins, hostile fetch metadata and form submissions', () => {
    const request = (headers: Record<string, string>) => new Request('https://center.example/api/mutations', { method: 'POST', headers });
    expect(() => assertSameOrigin(request({ Origin: 'https://center.example', 'Content-Type': 'application/json' }))).not.toThrow();
    for (const origin of ['https://evil.example', 'null', 'https://center.example.evil.test']) {
      expect(() => assertSameOrigin(request({ Origin: origin, 'Content-Type': 'application/json' }))).toThrow(ApiError);
    }
    expect(() => assertSameOrigin(request({ 'Content-Type': 'application/json' }))).toThrow(ApiError);
    expect(() => assertSameOrigin(request({ Origin: 'https://center.example', 'Content-Type': 'application/x-www-form-urlencoded' }))).toThrow(ApiError);
    expect(() => assertSameOrigin(request({ Origin: 'https://center.example', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }))).toThrow(ApiError);
  });

  it('bounds actual streamed request bytes, rejects malformed/unknown JSON and safely streams large multilingual responses', async () => {
    const request = (body: string) => new Request('https://center.example/api/mutations', { method: 'POST', headers: { Origin: 'https://center.example', 'Content-Type': 'application/json' }, body });
    await expect(readJson(request('{"name":"ok"}'), z.strictObject({ name: z.string() }))).resolves.toEqual({ name: 'ok' });
    await expect(readJson(request('{"name":"ok","role":"SUPER_ADMIN"}'), z.strictObject({ name: z.string() }))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request('{broken'), z.unknown())).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request(JSON.stringify({ name: 'أ'.repeat(100) })), z.unknown(), 100)).rejects.toMatchObject({ status: 413 });
    const value = { text: 'A'.repeat(32_758) + '😀عراق'.repeat(1_000_000) };
    const response = jsonResponse(value);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.has('Content-Length')).toBe(false);
    expect(await response.json()).toEqual(value);
  });

  it('never exposes unexpected database errors, SQL or credentials in an API response', async () => {
    const response = await apiRoute(async () => { throw new Error('postgres://owner:private-password@example/db SELECT hashes'); });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/postgres|private-password|SELECT|hashes/);
    const denied = await apiRoute(async () => { throw new ApiError(403, 'غير مسموح'); });
    expect(denied.status).toBe(403); expect(await denied.json()).toEqual({ error: 'غير مسموح' });
  });
});
