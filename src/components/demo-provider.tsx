'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { createInitialData } from '@/lib/mock-data';
import { assertSingleOpenWorkday } from '@/lib/attendance';
import { canManageEmployeeAccount } from '@/lib/permissions';
import { assertEvaluationMutation, assertEvaluationState } from '@/lib/evaluations';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN, PREVIEW_SYSTEM_USERNAME } from '@/lib/preview-config';
import { AUTH_STORAGE_KEY, clearEmployeeCredentials, configureSystemCredential, normalizeUsername, readAuthStore, readAuthStoreForBackup, setEmployeeCredential, verifyCredential } from '@/lib/local-auth';
import { createSystemBackup, type SystemBackup } from '@/lib/system-backup';
import type { DemoData, DemoSession, AuditInput } from '@/lib/types';

interface Snapshot {
  data: DemoData;
  session: DemoSession | null;
  ready: boolean;
  remembered: boolean;
  systemConfigured: boolean;
  systemUsername: string;
  revision?: number;
}
const collections: Array<keyof DemoData> = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'];
type DataUpdater = (draft: DemoData, currentSession: DemoSession | null) => void;
type AuditSource = AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined);
const serverSnapshot: Snapshot = { data: createInitialData(), session: null, ready: false, remembered: false, systemConfigured: false, systemUsername: PREVIEW_SYSTEM_USERNAME };
let snapshot = serverSnapshot;
let initialized = false;
let durableData = false;
let authOperation = 0;
const listeners = new Set<() => void>();

function readStorage(kind: 'sessionStorage' | 'localStorage', key: string) {
  try { return window[kind].getItem(key); } catch { return null; }
}
function writeStorage(kind: 'sessionStorage' | 'localStorage', key: string, value: string | null) {
  try { if (value === null) window[kind].removeItem(key); else window[kind].setItem(key, value); } catch { /* Keep the browser-local build usable when storage is denied or full. */ }
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
function authMeta() {
  const store = readAuthStore();
  return { systemConfigured: Boolean(store.system), systemUsername: store.system?.username || PREVIEW_SYSTEM_USERNAME };
}
function validSession(data: DemoData, candidate: DemoSession | null | undefined): DemoSession | null {
  if (!candidate) return null;
  const auth = readAuthStore();
  if (candidate.kind === 'SYSTEM' && candidate.role === 'SUPER_ADMIN') {
    if (!auth.system || candidate.authVersion !== auth.system.version) return null;
    return { ...PREVIEW_SYSTEM_ADMIN, authVersion: auth.system.version };
  }
  if (candidate.kind !== 'EMPLOYEE') return null;
  const account = data.employees.find(item => item.id === candidate.employeeId && item.active && item.role === candidate.role);
  const credential = candidate.employeeId && Object.hasOwn(auth.employees, candidate.employeeId) ? auth.employees[candidate.employeeId] : undefined;
  return account && credential && candidate.authVersion === credential.version
    ? { kind: 'EMPLOYEE', role: account.role, employeeId: account.id, name: account.name, authVersion: credential.version }
    : null;
}
function hydrateStored(raw: string | null, remembered = false): Snapshot | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored.version !== PREVIEW_STORAGE_VERSION || !stored.data) return null;
    stored.data.evaluationSeasons ??= [];
    stored.data.evaluationCycles ??= [];
    stored.data.evaluationExams ??= [];
    stored.data.examEvaluations ??= [];
    if (!collections.every(key => Array.isArray(stored.data?.[key])) || typeof stored.data?.settings?.centerName !== 'string' || !Number.isFinite(stored.data.settings.qrInterval)) return null;
    assertSingleOpenWorkday(stored.data.workdays);
    assertEvaluationState(stored.data);
    const session = validSession(stored.data, stored.session);
    return { data: stored.data, session, ready: true, remembered: Boolean((remembered || stored.remembered) && session), revision: Number.isSafeInteger(stored.revision) ? stored.revision : 0, ...authMeta() };
  } catch { return null; }
}
function sameAccount(left: DemoSession | null, right: DemoSession | null) {
  return Boolean(left && right && left.role === right.role && left.kind === right.kind && left.employeeId === right.employeeId && left.authVersion === right.authVersion);
}
function receiveStorage(event: StorageEvent) {
  if (event.key === PREVIEW_DATA_STORAGE_KEY) {
    const incoming = hydrateStored(event.newValue);
    if (!incoming || (incoming.revision ?? 0) < (snapshot.revision ?? 0)) return;
    durableData = true;
    const session = validSession(incoming.data, snapshot.session);
    publish({ ...snapshot, data: incoming.data, revision: incoming.revision, session, remembered: Boolean(snapshot.remembered && session), ...authMeta() });
  } else if (event.key === AUTH_STORAGE_KEY || event.key === null) {
    authOperation += 1;
    const session = validSession(snapshot.data, snapshot.session);
    if (!session) writeStorage('localStorage', PREVIEW_PERSISTENT_STORAGE_KEY, null);
    publish({ ...snapshot, session, remembered: Boolean(snapshot.remembered && session), ...authMeta() });
  } else if (event.key === PREVIEW_PERSISTENT_STORAGE_KEY && snapshot.remembered) {
    const remembered = event.key === null ? null : hydrateStored(event.newValue, true);
    const session = validSession(snapshot.data, remembered?.session);
    publish({ ...snapshot, session, remembered: Boolean(session), ...authMeta() });
  }
}

function initialize() {
  if (initialized) return;
  initialized = true;
  for (const key of ['centerpro-ui-preview-v1', 'centerpro-ui-preview-v2', 'centerpro-ui-preview-v3']) writeStorage('sessionStorage', key, null);
  for (const key of ['centerpro-ui-preview-remembered-v1', 'centerpro-ui-preview-data-v1']) writeStorage('localStorage', key, null);
  const rawCurrent = readStorage('sessionStorage', PREVIEW_STORAGE_KEY);
  const current = hydrateStored(rawCurrent);
  const remembered = hydrateStored(readStorage('localStorage', PREVIEW_PERSISTENT_STORAGE_KEY), true);
  const savedData = hydrateStored(readStorage('localStorage', PREVIEW_DATA_STORAGE_KEY));
  durableData = Boolean(savedData || remembered);
  let next: Snapshot = current ?? savedData ?? remembered ?? { ...serverSnapshot, data: createInitialData(), ready: true, ...authMeta() };
  if (savedData && (savedData.revision ?? 0) > (next.revision ?? 0)) next = { ...next, data: savedData.data, revision: savedData.revision };
  const rememberedSession = validSession(next.data, remembered?.session);
  const session = current
    ? next.remembered && !sameAccount(next.session, rememberedSession) ? null : validSession(next.data, next.session)
    : rememberedSession;
  next = { ...next, session, remembered: sameAccount(session, rememberedSession), ...authMeta() };
  if (rawCurrent && !current) writeStorage('sessionStorage', `${PREVIEW_STORAGE_KEY}-recovery`, rawCurrent);
  publish(next);
  window.addEventListener('storage', receiveStorage);
}
function subscribe(listener: () => void) { listeners.add(listener); queueMicrotask(initialize); return () => { listeners.delete(listener); }; }
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
interface DemoContextValue extends Snapshot {
  login: (username: string, password: string, remember?: boolean) => Promise<boolean>;
  setupSystemAdmin: (username: string, password: string, remember?: boolean) => Promise<boolean>;
  setEmployeePassword: (employeeId: string, password: string, onChanged?: () => void) => Promise<void>;
  prepareSystemBackup: (theme: 'light' | 'dark') => Promise<SystemBackup>;
  logout: () => void;
  resetDemo: () => void;
  updateData: (updater: DataUpdater, audit?: AuditSource) => void;
  notify: (message: string) => void;
}
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastSequence = useRef(0);
  const notify = useCallback((message: string) => { setToast({ id: ++toastSequence.current, message }); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function login(username: string, password: string, remember = false) {
    const operation = ++authOperation;
    const normalized = normalizeUsername(username);
    if (!normalized || !password) return false;
    const auth = readAuthStore();
    if (auth.system && normalizeUsername(auth.system.username) === normalized) {
      if (!await verifyCredential(password, auth.system) || operation !== authOperation) return false;
      const current = readAuthStore().system;
      if (!current || current.version !== auth.system.version || current.hash !== auth.system.hash
        || current.salt !== auth.system.salt || normalizeUsername(current.username) !== normalized) return false;
      emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN, authVersion: current.version }, remembered: remember, systemConfigured: true, systemUsername: current.username }, true);
      return true;
    }
    const employee = snapshot.data.employees.find(item => item.active && normalizeUsername(item.username) === normalized);
    if (!employee) return false;
    const credential = auth.employees[employee.id];
    if (!credential || !await verifyCredential(password, credential) || operation !== authOperation) return false;
    const current = readAuthStore().employees[employee.id];
    const account = snapshot.data.employees.find(item => item.id === employee.id && item.active && normalizeUsername(item.username) === normalized);
    if (!current || current.version !== credential.version || current.hash !== credential.hash || current.salt !== credential.salt || !account) return false;
    emit({ ...snapshot, session: { kind: 'EMPLOYEE', role: account.role, employeeId: account.id, name: account.name, authVersion: current.version }, remembered: remember }, true);
    return true;
  }

  async function setupSystemAdmin(username: string, password: string, remember = false) {
    const operation = ++authOperation;
    if (readAuthStore().system) return false;
    const normalized = normalizeUsername(username);
    const usernameAvailable = () => normalized && !snapshot.data.employees.some(employee => normalizeUsername(employee.username) === normalized);
    if (!usernameAvailable()) return false;
    const system = await configureSystemCredential(username.trim(), password, () => operation === authOperation && Boolean(usernameAvailable()));
    if (operation !== authOperation) return false;
    emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN, authVersion: system.version }, remembered: remember, systemConfigured: true, systemUsername: system.username }, true);
    return true;
  }

  async function setEmployeePassword(employeeId: string, password: string, onChanged?: () => void) {
    const actor = validSession(snapshot.data, snapshot.session);
    const operation = authOperation;
    const mayChange = () => {
      const session = validSession(snapshot.data, snapshot.session);
      const target = snapshot.data.employees.find(employee => employee.id === employeeId);
      return Boolean(actor && session && sameAccount(actor, session) && operation === authOperation
        && canManageEmployeeAccount(session.role, target?.role ?? 'EMPLOYEE'));
    };
    if (!mayChange()) throw new Error('ليس لديك صلاحية تغيير كلمة المرور لهذا الحساب.');
    await setEmployeeCredential(employeeId, password, mayChange);
    const changingOwnPassword = snapshot.session?.employeeId === employeeId;
    // Commit the accompanying profile/audit while the verified actor is still
    // available. A credential-storage failure never calls this callback.
    try {
      onChanged?.();
    } finally {
      if (changingOwnPassword) {
        authOperation += 1;
        emit({ ...snapshot, session: null, remembered: false }, true);
      } else {
        publish({ ...snapshot, ...authMeta() });
      }
    }
  }

  async function prepareSystemBackup(theme: 'light' | 'dark') {
    const actor = validSession(snapshot.data, snapshot.session);
    const operation = authOperation;
    if (!snapshot.ready || actor?.role !== 'SUPER_ADMIN') throw new Error('تحميل النسخة الاحتياطية متاح للمشرف العام فقط.');
    const auth = readAuthStoreForBackup();
    const credential = actor.kind === 'SYSTEM' ? auth.system : actor.employeeId ? auth.employees[actor.employeeId] : null;
    if (!credential || credential.version !== actor.authVersion) throw new Error('انتهت الجلسة. سجّل الدخول مجدداً قبل تحميل النسخة.');
    const backup = await createSystemBackup({ data: snapshot.data, auth, theme, revision: snapshot.revision ?? 0, origin: window.location.origin });
    const currentActor = validSession(snapshot.data, snapshot.session);
    if (operation !== authOperation || currentActor?.role !== 'SUPER_ADMIN' || !sameAccount(actor, currentActor)) throw new Error('انتهت الجلسة. سجّل الدخول مجدداً قبل تحميل النسخة.');
    return backup;
  }

  function logout() { authOperation += 1; emit({ ...snapshot, session: null, remembered: false }, true); }
  function resetDemo() {
    authOperation += 1;
    clearEmployeeCredentials();
    const auth = readAuthStore();
    emit({ data: createInitialData(), session: auth.system ? { ...PREVIEW_SYSTEM_ADMIN, authVersion: auth.system.version } : null, ready: true, remembered: false, systemConfigured: Boolean(auth.system), systemUsername: auth.system?.username || PREVIEW_SYSTEM_USERNAME }, true);
    notify('تم تصفير النظام. يمكنك إنشاء الأقسام والموظفين من البداية.');
  }
  function updateData(updater: DataUpdater, auditSource?: AuditSource) {
    const before = snapshot.data;
    const draft = structuredClone(before);
    updater(draft, snapshot.session);
    assertSingleOpenWorkday(draft.workdays);
    assertEvaluationMutation(before, draft, snapshot.session);
    const audit = typeof auditSource === 'function' ? auditSource(before, draft) : auditSource;
    if (audit && snapshot.session) {
      draft.audit.unshift({ id: crypto.randomUUID(), actor: snapshot.session.name, role: snapshot.session.role, action: audit.action, entity: audit.entity, entityId: audit.entityId, employeeId: audit.employeeId, oldValues: audit.oldValues || {}, newValues: audit.newValues || {}, timestamp: new Date().toISOString(), userAgent: 'CenterPro' });
    }
    const session = validSession(draft, snapshot.session);
    emit({ ...snapshot, data: draft, session, remembered: Boolean(snapshot.remembered && session) }, !session);
  }
  return <DemoContext.Provider value={{ ...state, login, setupSystemAdmin, setEmployeePassword, prepareSystemBackup, logout, resetDemo, updateData, notify }}>{children}{toast && <div key={toast.id} className="toast" role="status" aria-live="polite"><Check size={20}/><span>{toast.message}</span></div>}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context; }
export function useToast() { return useDemo().notify; }
