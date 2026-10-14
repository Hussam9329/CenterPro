import { eq } from 'drizzle-orm';
import type { NextResponse } from 'next/server';
import type { AuthStore } from '@/lib/local-auth';
import type { DemoData, DemoSession } from '@/lib/types';
import type { DbExecutor } from '../db/connection';
import { sessions } from '../db/schema';
import { hashSessionToken } from '../auth-crypto';

export const SESSION_HOURS = 8;
export const REMEMBER_DAYS = 30;

export interface Identity { actor: DemoSession; accountKey: string; tokenHash: string; remembered: boolean }

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
