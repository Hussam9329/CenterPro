import type { AuthStore } from '@/lib/local-auth';
import { createInitialData } from '@/lib/mock-data';
import type { RemoteSnapshot } from '@/lib/server-contract';
import type { DemoData } from '@/lib/types';
import { withDatabase, type Transaction } from '../db/connection';
import { loadAuthStore, loadCollections, loadData, lockState, readStateHeader, type CollectionName } from '../db/repository';
import { projectData } from '../projection';
import { serverSecret } from '../auth-crypto';
import { ApiError } from '../http';
import { resolveSession, type Identity } from './sessions';

export interface StateContext { tx: Transaction; data: DemoData; auth: AuthStore; revision: number; identity: Identity | null; now: Date }

export function requireIdentity(context: Pick<StateContext, 'identity'>): Identity {
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

export interface ReadContext<K extends CollectionName> {
  tx: Transaction; data: Pick<DemoData, K | 'employees' | 'settings'>; auth: AuthStore; revision: number; identity: Identity | null; now: Date;
}

/** For GET routes only: a repeatable-read snapshot that never locks the state row
 * and loads only the collections the route needs (employees always, for the session). */
export async function withReadState<K extends CollectionName, T>(request: Request, names: readonly K[], operation: (context: ReadContext<K>) => Promise<T>): Promise<T> {
  serverSecret();
  return withDatabase(db => db.transaction(async tx => {
    const { revision, settings } = await readStateHeader(tx);
    const collections = await loadCollections(tx, [...new Set<K | 'employees'>(['employees', ...names])]);
    const data = { ...collections, settings } as ReadContext<K>['data'];
    const auth = await loadAuthStore(tx);
    const now = new Date();
    const identity = await resolveSession(tx, request, data, auth, now);
    return operation({ tx, data, auth, revision, identity, now });
  }, { isolationLevel: 'repeatable read' }));
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
