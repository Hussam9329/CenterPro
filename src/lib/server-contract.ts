import type { AuditInput, DemoData, DemoSession, DemoSettings } from './types';

/** Only record-level commands cross the client/server boundary. Audit rows and
 * derived read models are never writable by a browser. */
export const MUTABLE_COLLECTIONS = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const;
export type MutableCollection = typeof MUTABLE_COLLECTIONS[number];
export interface RecordChange {
  collection: MutableCollection;
  upsert?: Array<Record<string, unknown>>;
  remove?: string[];
}
export interface MutationOptions { password?: { employeeId: string; value: string } }
export interface MutationRequest extends MutationOptions {
  revision: number;
  changes: RecordChange[];
  settings?: DemoSettings;
  audit?: AuditInput;
}
export interface RemoteSnapshot {
  data: DemoData;
  session: DemoSession | null;
  revision: number;
  ready: boolean;
  remembered: boolean;
  systemConfigured: boolean;
  systemUsername: string;
  today: string;
  month: string;
  serverTime: string;
  backend: 'neon';
  pendingImport: boolean;
  qrDisplayConfigured: boolean;
  qrDisplayUsername: string;
  qrDisplayActive: boolean;
}

/** Diff only the records the caller can see; server validates every operation
 * against its own canonical records inside the revision-locked transaction. */
export function diffData(before: DemoData, after: DemoData, revision: number, audit?: AuditInput, options?: MutationOptions): MutationRequest {
  const changes: RecordChange[] = [];
  for (const collection of MUTABLE_COLLECTIONS) {
    const previous = new Map(before[collection].map(record => [record.id, record]));
    const next = new Map(after[collection].map(record => [record.id, record]));
    const upsert = after[collection].filter(record => JSON.stringify(previous.get(record.id)) !== JSON.stringify(record)).map(record => {
      const intent: Record<string, unknown> = { ...record };
      // Archives are calculated from the server's locked records. Sending their
      // nested source photos would duplicate private data and exceed request limits.
      if (collection === 'months') { delete intent.snapshots; delete intent.sourceSnapshot; }
      if (collection === 'evaluationSeasons' || collection === 'evaluationCycles') delete intent.snapshot;
      return intent;
    });
    const remove = before[collection].filter(record => !next.has(record.id)).map(record => record.id);
    if (upsert.length || remove.length) changes.push({ collection, ...(upsert.length ? { upsert } : {}), ...(remove.length ? { remove } : {}) });
  }
  return { revision, changes, ...(JSON.stringify(before.settings) !== JSON.stringify(after.settings) ? { settings: after.settings } : {}), ...(audit ? { audit } : {}), ...options };
}
