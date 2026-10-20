import { createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AUTH_PASSWORD_KDF, type StoredCredential } from '@/lib/local-auth';
import { passwordProblem } from '@/lib/password-policy';
import type { Workday } from '@/lib/types';

const derive = promisify(pbkdf2);
const dummy: StoredCredential = { salt: Buffer.alloc(16).toString('base64'), hash: Buffer.alloc(32).toString('base64'), version: 1, updatedAt: '2026-01-01T00:00:00.000Z' };

export function serverSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Server authentication is not configured.');
  return secret;
}

export async function verifyServerPassword(password: string, credential?: StoredCredential | null): Promise<boolean> {
  const stored = credential ?? dummy;
  const expected = Buffer.from(stored.hash, 'base64');
  const salt = Buffer.from(stored.salt, 'base64');
  // All usernames, including unknown and inactive accounts, do the same KDF.
  const actual = await derive(password, salt.length === 16 ? salt : Buffer.alloc(16), AUTH_PASSWORD_KDF.iterations, AUTH_PASSWORD_KDF.derivedKeyBytes, 'sha256');
  return timingSafeEqual(actual, expected.length === 32 ? expected : Buffer.alloc(32)) && !!credential && salt.length === 16 && expected.length === 32;
}

export async function createServerCredential(password: string, previousVersion = 0, now = new Date()): Promise<StoredCredential> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (!Number.isSafeInteger(previousVersion) || previousVersion < 0 || previousVersion >= Number.MAX_SAFE_INTEGER) throw new Error('تعذر تحديث إصدار كلمة المرور.');
  const salt = randomBytes(AUTH_PASSWORD_KDF.saltBytes);
  const hash = await derive(password, salt, AUTH_PASSWORD_KDF.iterations, AUTH_PASSWORD_KDF.derivedKeyBytes, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), version: previousVersion + 1, updatedAt: now.toISOString() };
}

export function hashSessionToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function newSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function rateLimitKey(kind: 'account' | 'account-day' | 'ip', value: string): string {
  return `${kind}:${createHmac('sha256', serverSecret()).update(`login:${kind}:${value}`).digest('hex')}`;
}

export function workdayFingerprint(workday: Workday): string { return createHash('sha256').update(JSON.stringify(workday)).digest('hex'); }
interface QrPayload { v: 1; workdayId: string; fingerprint: string; issuedAt: number; expiresAt: number; nonce: string }

export function issueQr(workday: Workday, interval: number, now = Date.now()): { token: string; expiresAt: number; serverTime: number; workdayId: string } {
  const expiresAt = now + Math.min(60, Math.max(30, interval)) * 1000;
  const payload: QrPayload = { v: 1, workdayId: workday.id, fingerprint: workdayFingerprint(workday), issuedAt: now, expiresAt, nonce: randomBytes(16).toString('base64url') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', serverSecret()).update(`centerpro-qr-v1:${body}`).digest('base64url');
  return { token: `${body}.${signature}`, expiresAt, serverTime: now, workdayId: workday.id };
}

export function verifyQr(token: string, workday: Workday, now = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2 || token.length > 2048 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  const [body, signature] = parts;
  const expected = createHmac('sha256', serverSecret()).update(`centerpro-qr-v1:${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload: QrPayload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.v === 1 && payload.workdayId === workday.id && payload.fingerprint === workdayFingerprint(workday)
      && Number.isSafeInteger(payload.issuedAt) && Number.isSafeInteger(payload.expiresAt)
      && payload.issuedAt <= now && payload.expiresAt > now && payload.expiresAt - payload.issuedAt <= 60_000
      && payload.expiresAt - payload.issuedAt >= 30_000 && typeof payload.nonce === 'string' && /^[A-Za-z0-9_-]{22}$/.test(payload.nonce);
  } catch { return false; }
}
