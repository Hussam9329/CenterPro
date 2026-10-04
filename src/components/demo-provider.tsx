'use client';

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { createInitialData, createTestData } from '@/lib/mock-data';
import { assertSingleOpenWorkday } from '@/lib/attendance';
import { assertEvaluationMutation, assertEvaluationState } from '@/lib/evaluations';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN } from '@/lib/preview-config';
import type { DemoData, DemoSession, Role, AuditInput } from '@/lib/types';

interface Snapshot { data: DemoData; session: DemoSession | null; ready: boolean; remembered: boolean; revision?: number }
const collections: Array<keyof DemoData> = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'];
export function canLoadTestData(data: DemoData): boolean { return collections.every(key => Array.isArray(data[key]) && data[key].length === 0); }
type DataUpdater = (draft: DemoData, currentSession: DemoSession | null) => void;
type AuditSource = AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined);
const serverSnapshot: Snapshot = { data: createInitialData(), session: null, ready: false, remembered: false };
let snapshot = serverSnapshot;
let initialized = false;
let durableData = false;
const listeners = new Set<() => void>();

function readStorage(kind: 'sessionStorage' | 'localStorage', key: string) {
  try { return window[kind].getItem(key); } catch { return null; }
}
function writeStorage(kind: 'sessionStorage' | 'localStorage', key: string, value: string | null) {
  try { if (value === null) window[kind].removeItem(key); else window[kind].setItem(key, value); } catch { /* Keep the in-memory preview usable when storage is denied or full. */ }
}
function serialized(next: Snapshot, dataOnly = false) {
  return JSON.stringify({ version: PREVIEW_STORAGE_VERSION, revision: next.revision ?? 0, data: next.data, ...(!dataOnly && { session: next.session, remembered: next.remembered }) });
}
function publish(next: Snapshot) {
  snapshot = next;
  writeStorage('sessionStorage', PREVIEW_STORAGE_KEY, serialized(next));
  listeners.forEach(listener => listener());
}
function emit(next: Snapshot, changeRememberedSession = false) {
  next = { ...next, revision: Math.max(Date.now(), (snapshot.revision ?? 0) + 1) };
  durableData ||= next.remembered;
  if (durableData) writeStorage('localStorage', PREVIEW_DATA_STORAGE_KEY, serialized(next, true));
  if (next.remembered && next.session) writeStorage('localStorage', PREVIEW_PERSISTENT_STORAGE_KEY, serialized(next));
  else if (changeRememberedSession) writeStorage('localStorage', PREVIEW_PERSISTENT_STORAGE_KEY, null);
  publish(next);
}
function validSession(data: DemoData, candidate: DemoSession | null | undefined): DemoSession | null {
  if (candidate?.kind === 'SYSTEM' && candidate.role === 'SUPER_ADMIN') return { ...PREVIEW_SYSTEM_ADMIN };
  const account = data.employees.find(item => item.id === candidate?.employeeId && item.active && item.role === candidate?.role);
  return account ? { kind: 'EMPLOYEE', role: account.role, employeeId: account.id, name: account.name } : null;
}
function hydrateStored(raw: string | null, remembered = false): Snapshot | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (![2, PREVIEW_STORAGE_VERSION].includes(stored.version) || !stored.data) return null;
    // Extend old schemas without discarding owner records or inventing seasons.
    stored.data.evaluationSeasons ??= [];
    stored.data.evaluationCycles ??= [];
    stored.data.evaluationExams ??= [];
    stored.data.examEvaluations ??= [];
    if (!collections.every(key => Array.isArray(stored.data?.[key])) || typeof stored.data?.settings?.centerName !== 'string' || !Number.isFinite(stored.data.settings.qrInterval)) return null;
    assertSingleOpenWorkday(stored.data.workdays);
    assertEvaluationState(stored.data);
    const session = validSession(stored.data, stored.session);
    return { data: stored.data, session, ready: true, remembered: Boolean((remembered || stored.remembered) && session), revision: Number.isSafeInteger(stored.revision) ? stored.revision : 0 };
  } catch { return null; }
}
function sameAccount(left: DemoSession | null, right: DemoSession | null) {
  return Boolean(left && right && left.role === right.role && left.kind === right.kind && left.employeeId === right.employeeId);
}
function receiveStorage(event: StorageEvent) {
  if (event.key === PREVIEW_DATA_STORAGE_KEY) {
    const incoming = hydrateStored(event.newValue);
    if (!incoming || (incoming.revision ?? 0) < (snapshot.revision ?? 0)) return;
    durableData = true;
    const session = validSession(incoming.data, snapshot.session);
    publish({ ...snapshot, data: incoming.data, revision: incoming.revision, session, remembered: Boolean(snapshot.remembered && session) });
  } else if ((event.key === PREVIEW_PERSISTENT_STORAGE_KEY || event.key === null) && snapshot.remembered) {
    const remembered = event.key === null ? null : hydrateStored(event.newValue, true);
    const session = validSession(snapshot.data, remembered?.session);
    publish({ ...snapshot, session, remembered: Boolean(session) });
  }
}

function initialize() {
  if (initialized) return;
  initialized = true;
  writeStorage('sessionStorage', 'centerpro-ui-preview-v1', null);
  const rawCurrent = readStorage('sessionStorage', PREVIEW_STORAGE_KEY);
  const current = hydrateStored(rawCurrent);
  const legacy = hydrateStored(readStorage('sessionStorage', 'centerpro-ui-preview-v2'));
  const remembered = hydrateStored(readStorage('localStorage', PREVIEW_PERSISTENT_STORAGE_KEY), true);
  const savedData = hydrateStored(readStorage('localStorage', PREVIEW_DATA_STORAGE_KEY));
  durableData = Boolean(savedData || remembered);
  let next: Snapshot = current ?? legacy ?? savedData ?? remembered ?? { ...serverSnapshot, data: createInitialData(), ready: true };
  if (savedData && (savedData.revision ?? 0) > (next.revision ?? 0)) next = { ...next, data: savedData.data, revision: savedData.revision };
  const rememberedSession = validSession(next.data, remembered?.session);
  const session = current || legacy
    ? next.remembered && !sameAccount(next.session, rememberedSession) ? null : validSession(next.data, next.session)
    : rememberedSession;
  next = { ...next, session, remembered: sameAccount(session, rememberedSession) };
  // A damaged current payload must remain recoverable if another source is used.
  if (rawCurrent && !current) writeStorage('sessionStorage', `${PREVIEW_STORAGE_KEY}-recovery`, rawCurrent);
  publish(next);
  window.addEventListener('storage', receiveStorage);
}
function subscribe(listener: () => void) { listeners.add(listener); queueMicrotask(initialize); return () => { listeners.delete(listener); }; }
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
interface DemoContextValue extends Snapshot {
  login: (role: Role, employeeId?: string, remember?: boolean) => boolean;
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
  function login(role: Role, employeeId?: string, remember = false) {
    if (role === 'SUPER_ADMIN' && !employeeId) {
      emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN }, remembered: remember }, true);
      return true;
    }
    const user = snapshot.data.employees.find(employee => employee.role === role && employee.active && (!employeeId || employee.id === employeeId));
    if (!user) return false;
    emit({ ...snapshot, session: { kind: 'EMPLOYEE', role, employeeId: user.id, name: user.name }, remembered: remember }, true);
    return true;
  }
  function logout() { emit({ ...snapshot, session: null, remembered: false }, true); }
  function resetDemo() { emit({ data: createInitialData(), session: { ...PREVIEW_SYSTEM_ADMIN }, ready: true, remembered: false }, true); notify('تم تصفير المعاينة. يمكنك إنشاء الأقسام والموظفين من البداية.'); }
  function loadTestData() {
    if (!canLoadTestData(snapshot.data)) { notify('توجد بيانات في المعاينة. يمكنك تصفيرها من الإعدادات قبل تحميل بيانات الاختبار.'); return false; }
    emit({ ...snapshot, data: { ...createTestData(), settings: structuredClone(snapshot.data.settings) } });
    notify('تم تحميل 4 مصححين و3 مدققين مع بيانات الحضور الاختبارية. لم تتم إضافة امتحانات أو تقييمات.');
    return true;
  }
  function updateData(updater: DataUpdater, auditSource?: AuditSource) {
    const before = snapshot.data;
    const draft = structuredClone(before);
    updater(draft, snapshot.session);
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
