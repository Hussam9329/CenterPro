import { and, eq, lt, sql } from 'drizzle-orm';
import { normalizeUsername, type StoredCredential } from '@/lib/local-auth';
import type { RemoteSnapshot } from '@/lib/server-contract';
import type { DbExecutor } from '../db/connection';
import { loginRateLimits, sessions } from '../db/schema';
import { hashSessionToken, newSessionToken, rateLimitKey, verifyServerPassword } from '../auth-crypto';
import { SESSION_HOURS, REMEMBER_DAYS, readSessionToken, resolveAccount, type Identity } from './sessions';
import { makeSnapshot, withState } from './state';
import { trustedRequestIp } from './request-metadata';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ACCOUNT_LIMIT = 8;
export const LOGIN_IP_LIMIT = 200;
/** Daily cap per username: slows a password-guessing tool to a few dozen tries a day. */
export const LOGIN_DAY_MS = 24 * 60 * 60 * 1000;
export const LOGIN_ACCOUNT_DAILY_LIMIT = 30;

/** The shared database counter commits even when login fails. Upserts prevent
 * parallel instances from each granting their own attempt allowance. */
async function consumeAttempt(tx: DbExecutor, key: string, limit: number, now: Date, windowMs = LOGIN_WINDOW_MS): Promise<boolean> {
  const cutoff = new Date(now.getTime() - windowMs);
  const until = new Date(now.getTime() + windowMs);
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

export type LoginOutcome = { ok: false; status: 401 | 429 | 503; error: string; retryAfterSeconds?: number } | { ok: true; snapshot: RemoteSnapshot; token: string; remembered: boolean };

export async function login(request: Request, input: { username: string; password: string; remember: boolean }): Promise<LoginOutcome> {
  return withState(request, async context => {
    const { tx, data, auth, now } = context;
    const username = normalizeUsername(input.username);
    const accountBucket = rateLimitKey('account', username);
    const ipBucket = rateLimitKey('ip', trustedRequestIp(request) ?? (process.env.VERCEL === '1' ? 'unknown-vercel-client' : 'local-server'));
    const accountAllowed = await consumeAttempt(tx, accountBucket, LOGIN_ACCOUNT_LIMIT, now);
    const ipAllowed = await consumeAttempt(tx, ipBucket, LOGIN_IP_LIMIT, now);
    const dailyBucket = rateLimitKey('account-day', username);
    const dailyAllowed = await consumeAttempt(tx, dailyBucket, LOGIN_ACCOUNT_DAILY_LIMIT, now, LOGIN_DAY_MS);
    // Bounded housekeeping only deletes expired counters/sessions.
    await tx.delete(loginRateLimits).where(and(lt(loginRateLimits.windowStartedAt, new Date(now.getTime() - 86_400_000)), lt(loginRateLimits.count, 2_147_483_647)));
    await tx.delete(sessions).where(lt(sessions.expiresAt, now));
    if (!dailyAllowed) return { ok: false, status: 429, retryAfterSeconds: LOGIN_DAY_MS / 1000, error: 'تم إيقاف الدخول لهذا الحساب مؤقتاً بسبب محاولات خاطئة كثيرة. حاول بعد 24 ساعة أو تواصل مع إدارة المركز.' };
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
    await tx.delete(loginRateLimits).where(eq(loginRateLimits.key, dailyBucket));
    const identity: Identity = { actor, accountKey, tokenHash, remembered: input.remember };
    return { ok: true, token, remembered: input.remember, snapshot: makeSnapshot({ ...context, identity }) };
  });
}
