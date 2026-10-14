import { and, eq, lt, sql } from 'drizzle-orm';
import { isIP } from 'node:net';
import type { NextResponse } from 'next/server';
import { normalizeUsername, type AuthStore, type StoredCredential } from '@/lib/local-auth';
import { createInitialData } from '@/lib/mock-data';
import type { RemoteSnapshot } from '@/lib/server-contract';
import type { DemoData, DemoSession } from '@/lib/types';
import { withDatabase, type DbExecutor, type Transaction } from './db/connection';
import { loginRateLimits, sessions } from './db/schema';
import { loadAuthStore, loadData, lockState } from './db/repository';
import { projectData } from './projection';
import { hashSessionToken, newSessionToken, rateLimitKey, serverSecret, verifyServerPassword } from './auth-crypto';
import { ApiError } from './http';

export const SESSION_HOURS = 8;
export const REMEMBER_DAYS = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ACCOUNT_LIMIT = 8;
export const LOGIN_IP_LIMIT = 200;

export interface Identity { actor: DemoSession; accountKey: string; tokenHash: string; remembered: boolean }
export interface StateContext { tx: Transaction; data: DemoData; auth: AuthStore; revision: number; identity: Identity | null; now: Date }

export function sessionCookieName(): string { return process.env.NODE_ENV === 'production' ? '__Host-centerpro_session' : 'centerpro_session'; }

export function readSessionToken(request: Request): string | null {
  const prefix = `${sessionCookieName()}=`;
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function setSessionCookie(response: NextResponse, token: string, remembered: boolean): void {
  response.cookies.set(sessionCookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', ...(remembered ? { maxAge: REMEMBER_DAYS * 86_400 } : {}) });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(sessionCookieName(), '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
}

export function resolveAccount(data: DemoData, auth: AuthStore, accountKey: string, version: number): DemoSession | null {
  if (accountKey === 'SYSTEM') {
    return auth.system?.version === version ? { role: 'SUPER_ADMIN', kind: 'SYSTEM', name: 'مدير النظام', authVersion: version } : null;
  }
  if (accountKey === 'QR_DISPLAY') {
    return auth.qrDisplay?.active && auth.qrDisplay.version === version ? { role: 'QR_DISPLAY', kind: 'QR_DISPLAY', name: 'شاشة الحضور', authVersion: version } : null;
  }
  const employee = data.employees.find(row => row.id === accountKey && row.active);
  const credential = Object.hasOwn(auth.employees, accountKey) ? auth.employees[accountKey] : null;
  return employee && credential?.version === version ? { role: employee.role, kind: 'EMPLOYEE', employeeId: employee.id, name: employee.name, authVersion: version } : null;
}

export async function resolveSession(tx: DbExecutor, request: Request, data: DemoData, auth: AuthStore, now = new Date()): Promise<Identity | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const [session] = await tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!session) return null;
  const actor = session.expiresAt.getTime() > now.getTime() ? resolveAccount(data, auth, session.accountKey, session.authVersion) : null;
  if (!actor) { await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash)); return null; }
  return { actor, accountKey: session.accountKey, tokenHash, remembered: session.remembered };
}

export function requireIdentity(context: StateContext): Identity {
  if (!context.identity) throw new ApiError(401, 'انتهت الجلسة. سجّل الدخول مجدداً.');
  return context.identity;
}

export function baghdadDate(now: Date): string { return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }

export function makeSnapshot(context: Pick<StateContext, 'data' | 'auth' | 'revision' | 'identity' | 'now'>): RemoteSnapshot {
  const today = baghdadDate(context.now);
  return {
    data: context.identity ? projectData(context.data, context.identity.actor) : createInitialData(),
    session: context.identity?.actor ?? null, revision: context.identity ? context.revision : 0, ready: true,
    remembered: context.identity?.remembered ?? false,
    systemConfigured: !!context.auth.system,
    // Public status must never disclose the owner's chosen username.
    systemUsername: context.identity?.actor.role === 'SUPER_ADMIN' ? context.auth.system?.username ?? '' : '',
    qrDisplayConfigured: context.identity?.actor.role === 'SUPER_ADMIN' ? !!context.auth.qrDisplay : false,
    qrDisplayUsername: context.identity?.actor.role === 'SUPER_ADMIN' ? context.auth.qrDisplay?.username ?? '' : '',
    qrDisplayActive: context.identity?.actor.role === 'SUPER_ADMIN' ? context.auth.qrDisplay?.active ?? false : false,
    today, month: today.slice(0, 7), serverTime: context.now.toISOString(), backend: 'neon', pendingImport: !context.auth.system,
  };
}

export async function withState<T>(request: Request, operation: (context: StateContext) => Promise<T>): Promise<T> {
  serverSecret();
  return withDatabase(db => db.transaction(async tx => {
    const revision = await lockState(tx);
    const data = await loadData(tx);
    const auth = await loadAuthStore(tx);
    const now = new Date();
    const identity = await resolveSession(tx, request, data, auth, now);
    return operation({ tx, data, auth, revision, identity, now });
  }));
}

/** The shared database counter commits even when login fails. Upserts prevent
 * parallel instances from each granting their own attempt allowance. */
async function consumeAttempt(tx: DbExecutor, key: string, limit: number, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const until = new Date(now.getTime() + LOGIN_WINDOW_MS);
  const [row] = await tx.insert(loginRateLimits).values({ key, count: 1, windowStartedAt: now, blockedUntil: null }).onConflictDoUpdate({
    target: loginRateLimits.key,
    set: {
      count: sql`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then 1 else ${loginRateLimits.count} + 1 end`,
      windowStartedAt: sql`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then ${now} else ${loginRateLimits.windowStartedAt} end`,
      blockedUntil: sql`case when ${loginRateLimits.windowStartedAt} <= ${cutoff} then null when ${loginRateLimits.count} + 1 >= ${limit} then coalesce(${loginRateLimits.blockedUntil}, ${until}) else ${loginRateLimits.blockedUntil} end`,
    },
  }).returning();
  return row.count <= limit && (!row.blockedUntil || row.blockedUntil.getTime() <= now.getTime() || row.count === limit);
}

export function trustedRequestIp(request: Request): string | null {
  // Vercel overwrites this header at its edge. Generic X-Forwarded-For supplied
  // by a caller is not an authority for the rate-limit bucket.
  const value = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim().slice(0, 64) : undefined;
  return value && isIP(value) ? value : null;
}

export function stampAuditMetadata(request: Request, before: DemoData, after: DemoData): void {
  const existing = new Set(before.audit.map(row => row.id));
  const ip = trustedRequestIp(request);
  const userAgent = request.headers.get('user-agent')?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500);
  for (const row of after.audit) if (!existing.has(row.id)) {
    if (ip) row.ip = ip;
    if (userAgent) row.userAgent = userAgent;
  }
}

export type LoginOutcome = { ok: false; status: 401 | 429 | 503; error: string } | { ok: true; snapshot: RemoteSnapshot; token: string; remembered: boolean };

export async function login(request: Request, input: { username: string; password: string; remember: boolean }): Promise<LoginOutcome> {
  return withState(request, async context => {
    const { tx, data, auth, now } = context;
    const username = normalizeUsername(input.username);
    const accountBucket = rateLimitKey('account', username);
    const ipBucket = rateLimitKey('ip', trustedRequestIp(request) ?? (process.env.VERCEL === '1' ? 'unknown-vercel-client' : 'local-server'));
    const accountAllowed = await consumeAttempt(tx, accountBucket, LOGIN_ACCOUNT_LIMIT, now);
    const ipAllowed = await consumeAttempt(tx, ipBucket, LOGIN_IP_LIMIT, now);
    // Bounded housekeeping only deletes expired counters/sessions.
    await tx.delete(loginRateLimits).where(and(lt(loginRateLimits.windowStartedAt, new Date(now.getTime() - 86_400_000)), lt(loginRateLimits.count, 2_147_483_647)));
    await tx.delete(sessions).where(lt(sessions.expiresAt, now));
    if (!accountAllowed || !ipAllowed) return { ok: false, status: 429, error: 'محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مجدداً.' };
    let accountKey: string | null = null;
    let credential: StoredCredential | null = null;
    if (auth.system && normalizeUsername(auth.system.username) === username) { accountKey = 'SYSTEM'; credential = auth.system; }
    else if (auth.qrDisplay?.active && normalizeUsername(auth.qrDisplay.username) === username) { accountKey = 'QR_DISPLAY'; credential = auth.qrDisplay; }
    else {
      const employee = data.employees.find(row => normalizeUsername(row.username) === username);
      if (employee) { accountKey = employee.id; credential = Object.hasOwn(auth.employees, employee.id) ? auth.employees[employee.id] : null; }
    }
    const verified = await verifyServerPassword(input.password, credential);
    if (!auth.system) return { ok: false, status: 503, error: 'قاعدة البيانات جاهزة وبانتظار استيراد النسخة الاحتياطية. لم تتغير بيانات متصفحك.' };
    const actor = verified && accountKey && credential ? resolveAccount(data, auth, accountKey, credential.version) : null;
    if (!actor || !accountKey || !credential) return { ok: false, status: 401, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    const oldToken = readSessionToken(request);
    if (oldToken) await tx.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(oldToken)));
    const token = newSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(now.getTime() + (input.remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000));
    await tx.insert(sessions).values({ tokenHash, accountKey, authVersion: credential.version, expiresAt, createdAt: now, remembered: input.remember });
    await tx.delete(loginRateLimits).where(eq(loginRateLimits.key, accountBucket));
    const identity: Identity = { actor, accountKey, tokenHash, remembered: input.remember };
    return { ok: true, token, remembered: input.remember, snapshot: makeSnapshot({ ...context, identity }) };
  });
}
