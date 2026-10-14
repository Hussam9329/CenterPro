import type { MutationOptions } from '@/lib/server-contract';
import type { SystemBackup } from '@/lib/system-backup';
import type { AuditInput, DemoData, DemoSession } from '@/lib/types';

export interface Snapshot {
  data: DemoData;
  session: DemoSession | null;
  ready: boolean;
  remembered: boolean;
  systemConfigured: boolean;
  systemUsername: string;
  revision?: number;
  backend: 'local' | 'neon';
  today: string;
  month: string;
  pendingImport: boolean;
  qrDisplayConfigured: boolean;
  qrDisplayUsername: string;
  qrDisplayActive: boolean;
  serverTime?: string;
  connectionError?: string;
}
export type DataUpdater = (draft: DemoData, currentSession: DemoSession | null) => void;
export type AuditSource = AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined);
export interface DemoContextValue extends Snapshot {
  login: (username: string, password: string, remember?: boolean) => Promise<DemoSession | null>;
  setupSystemAdmin: (username: string, password: string, remember?: boolean) => Promise<DemoSession | null>;
  setEmployeePassword: (employeeId: string, password: string) => Promise<void>;
  saveQrDisplayAccount: (input: { username: string; password?: string; active: boolean }, draftForm?: HTMLFormElement) => Promise<void>;
  prepareSystemBackup: (theme: 'light' | 'dark') => Promise<SystemBackup>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  discardDraft: (form: HTMLFormElement | null) => void;
  resetDemo: () => void;
  updateData: (updater: DataUpdater, audit?: AuditSource, options?: MutationOptions, draftForm?: HTMLFormElement) => Promise<void>;
  notify: (message: string) => void;
}
