'use client';

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { createInitialData, createTestData } from '@/lib/mock-data';
import { assertSingleOpenWorkday } from '@/lib/attendance';
import { assertEvaluationMutation, assertEvaluationState } from '@/lib/evaluations';
import { PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN } from '@/lib/preview-config';
import type { DemoData, DemoSession, Role, AuditInput } from '@/lib/types';

interface Snapshot { data: DemoData; session: DemoSession | null; ready: boolean }
const collections: Array<keyof DemoData> = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationCycles', 'evaluationExams', 'examEvaluations'];
export function canLoadTestData(data: DemoData): boolean { return collections.every(key => Array.isArray(data[key]) && data[key].length === 0); }
type DataUpdater = (draft: DemoData, currentSession: DemoSession | null) => void;
type AuditSource = AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined);
const serverSnapshot: Snapshot = { data: createInitialData(), session: null, ready: false };
let snapshot = serverSnapshot;
let initialized = false;
const listeners = new Set<() => void>();
function emit(next: Snapshot) {
  snapshot = next;
  if (typeof window !== 'undefined' && next.ready) {
    try { sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ version: PREVIEW_STORAGE_VERSION, data: next.data, session: next.session })); } catch { /* Preview remains usable if storage is blocked. */ }
  }
  listeners.forEach(listener => listener());
}
function initialize() {
  if (initialized) return;
  initialized = true;
  let next: Snapshot = { ...serverSnapshot, data: createInitialData(), ready: true };
  try {
    sessionStorage.removeItem('centerpro-ui-preview-v1');
    // v2 contains owner-entered data. Upgrade its schema without resetting it.
    const current = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
    const raw = current ?? sessionStorage.getItem('centerpro-ui-preview-v2');
    if (raw) {
      const stored = JSON.parse(raw);
      if (!current && stored.version === 2 && stored.data) {
        stored.data = { ...stored.data, evaluationCycles: [], evaluationExams: [], examEvaluations: [] };
        stored.version = PREVIEW_STORAGE_VERSION;
      }
      if (stored.version === PREVIEW_STORAGE_VERSION && collections.every(key => Array.isArray(stored.data?.[key])) && typeof stored.data?.settings?.centerName === 'string' && Number.isFinite(stored.data.settings.qrInterval)) {
        assertSingleOpenWorkday(stored.data.workdays);
        assertEvaluationState(stored.data);
        let session: DemoSession | null = null;
        if (stored.session?.kind === 'SYSTEM' && stored.session.role === 'SUPER_ADMIN') session = { ...PREVIEW_SYSTEM_ADMIN };
        else {
          const account = (stored.data as DemoData).employees.find(item => item.id === stored.session?.employeeId && item.active && item.role === stored.session?.role);
          if (account) session = { kind: 'EMPLOYEE', role: account.role, employeeId: account.id, name: account.name };
        }
        next = { data: stored.data, session, ready: true };
      }
    }
  } catch { /* Invalid preview storage is safely reset. */ }
  emit(next);
}
function subscribe(listener: () => void) { listeners.add(listener); queueMicrotask(initialize); return () => { listeners.delete(listener); }; }
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
interface DemoContextValue extends Snapshot {
  login: (role: Role, employeeId?: string) => boolean;
  logout: () => void;
  resetDemo: () => void;
  loadTestData: () => boolean;
  updateData: (updater: DataUpdater, audit?: AuditSource) => void;
  notify: (message: string) => void;
}
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => { setToast(message); }, []);
  function login(role: Role, employeeId?: string) {
    if (role === 'SUPER_ADMIN' && !employeeId) {
      emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN } });
      return true;
    }
    const user = snapshot.data.employees.find(employee => employee.role === role && employee.active && (!employeeId || employee.id === employeeId));
    if (!user) return false;
    emit({ ...snapshot, session: { kind: 'EMPLOYEE', role, employeeId: user.id, name: user.name } });
    return true;
  }
  function logout() { emit({ ...snapshot, session: null }); }
  function resetDemo() { emit({ data: createInitialData(), session: { ...PREVIEW_SYSTEM_ADMIN }, ready: true }); notify('تم تصفير المعاينة. يمكنك إنشاء الأقسام والموظفين من البداية.'); }
  function loadTestData() {
    if (!canLoadTestData(snapshot.data)) { notify('توجد بيانات في المعاينة. يمكنك تصفيرها من الإعدادات قبل تحميل بيانات الاختبار.'); return false; }
    emit({ data: { ...createTestData(), settings: structuredClone(snapshot.data.settings) }, session: { ...PREVIEW_SYSTEM_ADMIN }, ready: true });
    notify('تم تحميل حسابات وبيانات الحضور الاختبارية. لم تتم إضافة أي امتحانات أو تقييمات.');
    return true;
  }
  function updateData(updater: DataUpdater, auditSource?: AuditSource) {
    const before = snapshot.data;
    const draft = structuredClone(before);
    updater(draft, snapshot.session);
    // Guard the shared mutation boundary, including any future UI entry point.
    assertSingleOpenWorkday(draft.workdays);
    assertEvaluationMutation(before, draft, snapshot.session);
    const audit = typeof auditSource === 'function' ? auditSource(before, draft) : auditSource;
    if (audit && snapshot.session) {
      draft.audit.unshift({ id: crypto.randomUUID(), actor: snapshot.session.name, role: snapshot.session.role, action: audit.action, entity: audit.entity, entityId: audit.entityId, employeeId: audit.employeeId, oldValues: audit.oldValues || {}, newValues: audit.newValues || {}, timestamp: new Date().toISOString(), userAgent: 'معاينة واجهات CenterPro' });
    }
    emit({ ...snapshot, data: draft });
  }
  return <DemoContext.Provider value={{ ...state, login, logout, resetDemo, loadTestData, updateData, notify }}>{children}{toast && <div className="toast" role="status"><Check size={20}/><span>{toast}</span><button onClick={() => setToast('')} aria-label="إغلاق الإشعار"><X size={17}/></button></div>}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context; }
export function useToast() { return useDemo().notify; }
