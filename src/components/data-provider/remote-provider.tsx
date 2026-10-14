import { useState, type ReactNode } from 'react';
import { diffData, type MutationOptions, type RemoteSnapshot } from '@/lib/server-contract';
import type { SystemBackup } from '@/lib/system-backup';
import type { DemoSession } from '@/lib/types';
import { DemoContext } from './context';
import { RemoteDrafts } from './remote-drafts';
import { useRemoteSnapshot } from './use-remote-snapshot';
import type { AuditSource, DataUpdater } from './types';
import { ProviderToast, useProviderToast } from './provider-toast';
import { remoteRequest, RemoteRequestError } from './remote-request';

export function RemoteDemoProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new RemoteDrafts());
  const { state, current, changing, beginChange, endChange, publishRemote, refresh } = useRemoteSnapshot(drafts);
  const { toast, notify } = useProviderToast();

  async function login(username: string, password: string, remember = false) {
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    beginChange();
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/auth/login', { username, password, remember });
      drafts.saved();
      publishRemote(next);
      return next.session;
    } catch (error) {
      if (error instanceof RemoteRequestError && error.status === 401) return null;
      throw error;
    } finally { endChange(); }
  }
  async function logout() {
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    beginChange();
    try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/auth/logout', {})); }
    finally { endChange(); }
  }
  function discardDraft(form: HTMLFormElement | null) {
    drafts.discard(form);
  }
  async function updateData(updater: DataUpdater, auditSource?: AuditSource, options?: MutationOptions, draftForm?: HTMLFormElement) {
    drafts.assertNoConflicts();
    if (changing.current) throw new Error('توجد عملية حفظ قيد التنفيذ. انتظر اكتمالها ثم أعد المحاولة.');
    const before = current.current;
    if (!before.ready || !before.session) throw new Error('انتهت الجلسة. سجّل الدخول مجدداً.');
    if (before.connectionError) throw new Error('تعذر الاتصال بالخادم. حدّث البيانات قبل محاولة الحفظ.');
    const draft = structuredClone(before.data);
    updater(draft, before.session);
    const audit = typeof auditSource === 'function' ? auditSource(before.data, draft) : auditSource;
    const command = diffData(before.data, draft, before.revision ?? 0, audit, options);
    if (!command.changes.length && !command.settings && !command.password && !command.audit && !command.deletion) return;
    beginChange();
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/mutations', command);
      drafts.saved(draftForm);
      publishRemote(next);
    }
    catch (error) {
      // The failed command never changes the local snapshot. Refresh conflicts
      // and revoked sessions so the next user action starts from server truth.
      if (error instanceof RemoteRequestError && error.status === 409) {
        drafts.markConflicts(true);
      }
      if (error instanceof RemoteRequestError && [401, 403, 409].includes(error.status)) {
        try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/state')); } catch { /* Keep the last confirmed read model. */ }
      }
      if (error instanceof RemoteRequestError && error.status === 409 && drafts.hasConflicts()) throw new Error(drafts.conflictMessage);
      throw error;
    } finally { endChange(); }
  }
  async function setEmployeePassword(employeeId: string, password: string) {
    await updateData(() => {}, { action: 'تغيير كلمة مرور الموظف', entity: 'employee', entityId: employeeId, employeeId, newValues: { passwordChanged: true, sessionsInvalidated: true } }, { password: { employeeId, value: password } });
  }
  async function saveQrDisplayAccount(input: { username: string; password?: string; active: boolean }, draftForm?: HTMLFormElement) {
    drafts.assertNoConflicts();
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    const before = current.current;
    if (before.session?.role !== 'SUPER_ADMIN') throw new Error('إدارة حساب شاشة الحضور متاحة للمشرف العام فقط.');
    if (before.connectionError) throw new Error('تعذر الاتصال بالخادم. حدّث البيانات قبل محاولة الحفظ.');
    beginChange();
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/auth/qr-display', { revision: before.revision ?? 0, ...input });
      drafts.saved(draftForm);
      publishRemote(next);
    } catch (error) {
      if (error instanceof RemoteRequestError && error.status === 409) {
        drafts.markConflicts();
      }
      if (error instanceof RemoteRequestError && [401, 403, 409].includes(error.status)) {
        try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/state')); } catch { /* Preserve the last confirmed state. */ }
      }
      if (error instanceof RemoteRequestError && error.status === 409 && drafts.hasConflicts()) throw new Error(drafts.conflictMessage);
      throw error;
    } finally { endChange(); }
  }

  async function prepareSystemBackup(theme: 'light' | 'dark') {
    if (current.current.session?.role !== 'SUPER_ADMIN') throw new Error('تحميل النسخة الاحتياطية متاح للمشرف العام فقط.');
    return remoteRequest<SystemBackup>(`/api/backup?theme=${theme}`);
  }
  const setupSystemAdmin = async (): Promise<DemoSession | null> => { throw new Error('تهيئة الحسابات متوقفة إلى حين استيراد النسخة الاحتياطية إلى قاعدة البيانات.'); };
  const resetDemo = () => { throw new Error('تصفير بيانات قاعدة البيانات غير متاح من الواجهة.'); };
  return <DemoContext.Provider value={{ ...state, login, setupSystemAdmin, setEmployeePassword, saveQrDisplayAccount, prepareSystemBackup, logout, refresh, discardDraft, resetDemo, updateData, notify }}>{children}<ProviderToast toast={toast}/></DemoContext.Provider>;
}
