'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { createInitialData, DEMO_TODAY, DEMO_MONTH } from '@/lib/mock-data';
import { diffData, type MutationOptions, type RemoteSnapshot } from '@/lib/server-contract';
import { applyDeletionPlan, authorizeDeletion, getDeletionPlan } from '@/lib/safe-deletion';
import { assertSingleOpenWorkday } from '@/lib/attendance';
import { canManageEmployeeAccount } from '@/lib/permissions';
import { assertEvaluationMutation, assertEvaluationState } from '@/lib/evaluations';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN, PREVIEW_SYSTEM_USERNAME } from '@/lib/preview-config';
import { AUTH_STORAGE_KEY, clearEmployeeCredentials, configureSystemCredential, normalizeUsername, removeEmployeeCredential, readAuthStore, readAuthStoreForBackup, setEmployeeCredential, verifyCredential } from '@/lib/local-auth';
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
const collections: Array<keyof DemoData> = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'];
type DataUpdater = (draft: DemoData, currentSession: DemoSession | null) => void;
type AuditSource = AuditInput | ((before: DemoData, after: DemoData) => AuditInput | undefined);
const serverSnapshot: Snapshot = { backend: 'local', today: DEMO_TODAY, month: DEMO_MONTH, pendingImport: false, qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false, data: createInitialData(), session: null, ready: false, remembered: false, systemConfigured: false, systemUsername: PREVIEW_SYSTEM_USERNAME };
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
  return { systemConfigured: Boolean(store.system), systemUsername: store.system?.username || PREVIEW_SYSTEM_USERNAME, qrDisplayConfigured: Boolean(store.qrDisplay), qrDisplayUsername: store.qrDisplay?.username || '', qrDisplayActive: store.qrDisplay?.active ?? false };
}
function validSession(data: DemoData, candidate: DemoSession | null | undefined): DemoSession | null {
  if (!candidate) return null;
  const auth = readAuthStore();
  if (candidate.kind === 'SYSTEM' && candidate.role === 'SUPER_ADMIN') {
    if (!auth.system || candidate.authVersion !== auth.system.version) return null;
    return { ...PREVIEW_SYSTEM_ADMIN, authVersion: auth.system.version };
  }
  if (candidate.kind === 'QR_DISPLAY' && candidate.role === 'QR_DISPLAY') {
    if (!auth.qrDisplay?.active || candidate.authVersion !== auth.qrDisplay.version) return null;
    return { kind: 'QR_DISPLAY', role: 'QR_DISPLAY', name: 'شاشة الحضور', authVersion: auth.qrDisplay.version };
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
    return { backend: 'local', today: DEMO_TODAY, month: DEMO_MONTH, pendingImport: false, data: stored.data, session, ready: true, remembered: Boolean((remembered || stored.remembered) && session), revision: Number.isSafeInteger(stored.revision) ? stored.revision : 0, ...authMeta() };
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
const DemoContext = createContext<DemoContextValue | null>(null);

function LocalDemoProvider({ children }: { children: ReactNode }) {
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
    if (!normalized || !password) return null;
    const auth = readAuthStore();
    if (auth.system && normalizeUsername(auth.system.username) === normalized) {
      if (!await verifyCredential(password, auth.system) || operation !== authOperation) return null;
      const current = readAuthStore().system;
      if (!current || current.version !== auth.system.version || current.hash !== auth.system.hash
        || current.salt !== auth.system.salt || normalizeUsername(current.username) !== normalized) return null;
      emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN, authVersion: current.version }, remembered: remember, systemConfigured: true, systemUsername: current.username }, true);
      return snapshot.session;
    }
    if (auth.qrDisplay?.active && normalizeUsername(auth.qrDisplay.username) === normalized) {
      if (!await verifyCredential(password, auth.qrDisplay) || operation !== authOperation) return null;
      const current = readAuthStore().qrDisplay;
      if (!current?.active || current.version !== auth.qrDisplay.version || normalizeUsername(current.username) !== normalized) return null;
      emit({ ...snapshot, session: { kind: 'QR_DISPLAY', role: 'QR_DISPLAY', name: 'شاشة الحضور', authVersion: current.version }, remembered: remember }, true);
      return snapshot.session;
    }
    const employee = snapshot.data.employees.find(item => item.active && normalizeUsername(item.username) === normalized);
    if (!employee) return null;
    const credential = auth.employees[employee.id];
    if (!credential || !await verifyCredential(password, credential) || operation !== authOperation) return null;
    const current = readAuthStore().employees[employee.id];
    const account = snapshot.data.employees.find(item => item.id === employee.id && item.active && normalizeUsername(item.username) === normalized);
    if (!current || current.version !== credential.version || current.hash !== credential.hash || current.salt !== credential.salt || !account) return null;
    emit({ ...snapshot, session: { kind: 'EMPLOYEE', role: account.role, employeeId: account.id, name: account.name, authVersion: current.version }, remembered: remember }, true);
    return snapshot.session;
  }

  async function setupSystemAdmin(username: string, password: string, remember = false) {
    const operation = ++authOperation;
    if (readAuthStore().system) return null;
    const normalized = normalizeUsername(username);
    const usernameAvailable = () => normalized && !snapshot.data.employees.some(employee => normalizeUsername(employee.username) === normalized);
    if (!usernameAvailable()) return null;
    const system = await configureSystemCredential(username.trim(), password, () => operation === authOperation && Boolean(usernameAvailable()));
    if (operation !== authOperation) return null;
    emit({ ...snapshot, session: { ...PREVIEW_SYSTEM_ADMIN, authVersion: system.version }, remembered: remember, systemConfigured: true, systemUsername: system.username }, true);
    return snapshot.session;
  }

  async function setEmployeePassword(employeeId: string, password: string, onChanged?: () => void | Promise<void>) {
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
      await onChanged?.();
    } finally {
      if (changingOwnPassword) {
        authOperation += 1;
        emit({ ...snapshot, session: null, remembered: false }, true);
      } else {
        publish({ ...snapshot, ...authMeta() });
      }
    }
  }

  async function saveQrDisplayAccount() {
    throw new Error('إدارة حساب شاشة الحضور متاحة عند الاتصال بقاعدة البيانات.');
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

  async function logout() { authOperation += 1; emit({ ...snapshot, session: null, remembered: false }, true); }
  function resetDemo() {
    authOperation += 1;
    clearEmployeeCredentials();
    const auth = readAuthStore();
    emit({ backend: 'local', today: DEMO_TODAY, month: DEMO_MONTH, pendingImport: false, data: createInitialData(), session: auth.system ? { ...PREVIEW_SYSTEM_ADMIN, authVersion: auth.system.version } : null, ready: true, remembered: false, ...authMeta() }, true);
    notify('تم تصفير النظام. يمكنك إنشاء الأقسام والموظفين من البداية.');
  }
  async function updateData(updater: DataUpdater, auditSource?: AuditSource, options?: MutationOptions) {
    const before = snapshot.data;
    const draft = structuredClone(before);
    let deletionAudit: AuditInput | undefined;
    if (options?.deletion) {
      const intent = options.deletion;
      if (options.password) throw new Error('نفّذ عملية الحذف وحدها.');
      authorizeDeletion(before, validSession(before, snapshot.session), intent.collection, intent.id);
      const plan = getDeletionPlan(before, intent.collection, intent.id);
      if (plan.blockers.length) throw new Error(plan.blockers[0]);
      if (intent.confirmation !== 'حذف' || intent.reason.trim().length < 3 || intent.reason.trim().length > 1000) throw new Error('اكتب كلمة حذف وسبباً واضحاً للحذف.');
      // Match the remote command: derive the cascade from the current store,
      // rather than applying arbitrary updater changes alongside a deletion.
      applyDeletionPlan(draft, plan);
      deletionAudit = { action: 'حذف آمن مؤكد', entity: intent.collection, entityId: intent.id,
        employeeId: intent.collection === 'employees' ? intent.id : undefined,
        oldValues: { removedIds: plan.removals },
        newValues: { reason: intent.reason.trim(), confirmation: 'حذف',
          removed: Object.fromEntries(Object.entries(plan.removals).map(([key, ids]) => [key, ids.length])), modifiedWorkdays: plan.affectedOverrides } };
    } else {
      updater(draft, snapshot.session);
      assertEvaluationMutation(before, draft, snapshot.session);
    }
    assertSingleOpenWorkday(draft.workdays);
    const audit = deletionAudit ?? (typeof auditSource === 'function' ? auditSource(before, draft) : auditSource);
    if (audit && snapshot.session) {
      draft.audit.unshift({ id: crypto.randomUUID(), actor: snapshot.session.name, role: snapshot.session.role, action: audit.action, entity: audit.entity, entityId: audit.entityId, employeeId: audit.employeeId, oldValues: audit.oldValues || {}, newValues: audit.newValues || {}, timestamp: new Date().toISOString(), userAgent: 'CenterPro' });
    }
    const commit = () => {
      const session = validSession(draft, snapshot.session);
      emit({ ...snapshot, data: draft, session, remembered: Boolean(snapshot.remembered && session) }, !session);
    };
    if (options?.password) {
      try { await setEmployeePassword(options.password.employeeId, options.password.value, commit); }
      catch (error) {
        if (!before.employees.some(employee => employee.id === options.password?.employeeId)) removeEmployeeCredential(options.password.employeeId);
        throw error;
      }
    } else {
      if (options?.deletion?.collection === 'employees') removeEmployeeCredential(options.deletion.id);
      commit();
    }
  }
  return <DemoContext.Provider value={{ ...state, login, setupSystemAdmin, setEmployeePassword, saveQrDisplayAccount, prepareSystemBackup, logout, refresh: async () => {}, discardDraft: () => {}, resetDemo, updateData, notify }}>{children}{toast && <div key={toast.id} className="toast" role="status" aria-live="polite"><Check size={20}/><span>{toast.message}</span></div>}</DemoContext.Provider>;
}
class RemoteRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function remoteRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new RemoteRequestError('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى. لم يتم تأكيد حفظ التغيير.', 0); }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new RemoteRequestError('لم تصل استجابة صالحة من الخادم. حدّث البيانات وتحقق من النتيجة قبل إعادة المحاولة.', response.status); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error : 'تعذر تنفيذ العملية. حاول مرة أخرى.';
    throw new RemoteRequestError(message, response.status);
  }
  return result as T;
}

const remoteInitialSnapshot: Snapshot = { ...serverSnapshot, backend: 'neon', today: '', month: '', pendingImport: false };
function RemoteDemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Snapshot>(remoteInitialSnapshot);
  const current = useRef<Snapshot>(remoteInitialSnapshot);
  const operation = useRef(0);
  const changing = useRef(false);
  const editedForms = useRef(new Set<Element>());
  const conflictedForms = useRef(new Set<Element>());
  const conflictMessage = 'تغيّرت البيانات من جهاز آخر. أعد فتح النموذج، أو ألغِ التغييرات لمراجعة البيانات الجديدة قبل الحفظ.';
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastSequence = useRef(0);
  const notify = useCallback((message: string) => setToast({ id: ++toastSequence.current, message }), []);
  const publishRemote = useCallback((next: Snapshot) => {
    current.current = next;
    setState(next);
  }, []);
  const refreshState = useCallback(async (background = false) => {
    const sequence = operation.current;
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/state');
      if (sequence === operation.current && !changing.current) {
        if (current.current.ready && sameAccount(next.session, current.current.session) && next.revision < (current.current.revision ?? 0)) return;
        for (const form of editedForms.current) if (!form.isConnected) editedForms.current.delete(form);
        const editing = document.querySelector('[role="dialog"]') || editedForms.current.size > 0;
        if (background && editing && sameAccount(next.session, current.current.session)) {
          // Preserve the edit's original revision. A save after someone else
          // changes the server must conflict instead of overwriting their work.
          publishRemote({ ...current.current, today: next.today, month: next.month, connectionError: undefined });
        } else publishRemote(next);
      }
    } catch (error) {
      if (sequence === operation.current) publishRemote({ ...current.current, connectionError: error instanceof Error ? error.message : 'تعذر الاتصال بالخادم.' });
      throw error;
    }
  }, [publishRemote]);
  const refresh = useCallback(() => refreshState(), [refreshState]);
  useEffect(() => {
    let active = true;
    const markEdited = (event: Event) => { const target = event.target; if (target instanceof Element) { const form = target.closest('form'); if (form) editedForms.current.add(form); } };
    const load = () => { if (active && !changing.current && document.visibilityState !== 'hidden') void refreshState(true).catch(() => {}); };
    load();
    const timer = window.setInterval(load, 15_000);
    document.addEventListener('input', markEdited);
    document.addEventListener('change', markEdited);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); document.removeEventListener('input', markEdited); document.removeEventListener('change', markEdited); };
  }, [refreshState]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(value => value?.id === toast.id ? null : value), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function login(username: string, password: string, remember = false) {
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    changing.current = true;
    operation.current += 1;
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/auth/login', { username, password, remember });
      editedForms.current.clear();
      publishRemote(next);
      return next.session;
    } catch (error) {
      if (error instanceof RemoteRequestError && error.status === 401) return null;
      throw error;
    } finally { changing.current = false; }
  }
  async function logout() {
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    changing.current = true;
    operation.current += 1;
    try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/auth/logout', {})); }
    finally { changing.current = false; }
  }
  function discardDraft(form: HTMLFormElement | null) {
    if (!form) return;
    editedForms.current.delete(form);
    conflictedForms.current.delete(form);
  }
  async function updateData(updater: DataUpdater, auditSource?: AuditSource, options?: MutationOptions, draftForm?: HTMLFormElement) {
    for (const form of conflictedForms.current) if (!form.isConnected) conflictedForms.current.delete(form);
    if (conflictedForms.current.size) throw new Error(conflictMessage);
    if (changing.current) throw new Error('توجد عملية حفظ قيد التنفيذ. انتظر اكتمالها ثم أعد المحاولة.');
    const before = current.current;
    if (!before.ready || !before.session) throw new Error('انتهت الجلسة. سجّل الدخول مجدداً.');
    if (before.connectionError) throw new Error('تعذر الاتصال بالخادم. حدّث البيانات قبل محاولة الحفظ.');
    const draft = structuredClone(before.data);
    updater(draft, before.session);
    const audit = typeof auditSource === 'function' ? auditSource(before.data, draft) : auditSource;
    const command = diffData(before.data, draft, before.revision ?? 0, audit, options);
    if (!command.changes.length && !command.settings && !command.password && !command.audit && !command.deletion) return;
    changing.current = true;
    operation.current += 1;
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/mutations', command);
      if (draftForm) editedForms.current.delete(draftForm);
      else editedForms.current.clear();
      publishRemote(next);
    }
    catch (error) {
      // The failed command never changes the local snapshot. Refresh conflicts
      // and revoked sessions so the next user action starts from server truth.
      if (error instanceof RemoteRequestError && error.status === 409) {
        for (const form of editedForms.current) if (form.isConnected) conflictedForms.current.add(form);
        for (const dialog of document.querySelectorAll('[role="dialog"]')) conflictedForms.current.add(dialog);
      }
      if (error instanceof RemoteRequestError && [401, 403, 409].includes(error.status)) {
        try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/state')); } catch { /* Keep the last confirmed read model. */ }
      }
      if (error instanceof RemoteRequestError && error.status === 409 && conflictedForms.current.size) throw new Error(conflictMessage);
      throw error;
    } finally { changing.current = false; }
  }
  async function setEmployeePassword(employeeId: string, password: string) {
    await updateData(() => {}, { action: 'تغيير كلمة مرور الموظف', entity: 'employee', entityId: employeeId, employeeId, newValues: { passwordChanged: true, sessionsInvalidated: true } }, { password: { employeeId, value: password } });
  }
  async function saveQrDisplayAccount(input: { username: string; password?: string; active: boolean }, draftForm?: HTMLFormElement) {
    for (const form of conflictedForms.current) if (!form.isConnected) conflictedForms.current.delete(form);
    if (conflictedForms.current.size) throw new Error(conflictMessage);
    if (changing.current) throw new Error('انتظر اكتمال العملية الحالية.');
    const before = current.current;
    if (before.session?.role !== 'SUPER_ADMIN') throw new Error('إدارة حساب شاشة الحضور متاحة للمشرف العام فقط.');
    if (before.connectionError) throw new Error('تعذر الاتصال بالخادم. حدّث البيانات قبل محاولة الحفظ.');
    changing.current = true;
    operation.current += 1;
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/auth/qr-display', { revision: before.revision ?? 0, ...input });
      if (draftForm) editedForms.current.delete(draftForm);
      else editedForms.current.clear();
      publishRemote(next);
    } catch (error) {
      if (error instanceof RemoteRequestError && error.status === 409) {
        for (const form of editedForms.current) if (form.isConnected) conflictedForms.current.add(form);
      }
      if (error instanceof RemoteRequestError && [401, 403, 409].includes(error.status)) {
        try { publishRemote(await remoteRequest<RemoteSnapshot>('/api/state')); } catch { /* Preserve the last confirmed state. */ }
      }
      if (error instanceof RemoteRequestError && error.status === 409 && conflictedForms.current.size) throw new Error(conflictMessage);
      throw error;
    } finally { changing.current = false; }
  }

  async function prepareSystemBackup(theme: 'light' | 'dark') {
    if (current.current.session?.role !== 'SUPER_ADMIN') throw new Error('تحميل النسخة الاحتياطية متاح للمشرف العام فقط.');
    return remoteRequest<SystemBackup>(`/api/backup?theme=${theme}`);
  }
  const setupSystemAdmin = async (): Promise<DemoSession | null> => { throw new Error('تهيئة الحسابات متوقفة إلى حين استيراد النسخة الاحتياطية إلى قاعدة البيانات.'); };
  const resetDemo = () => { throw new Error('تصفير بيانات قاعدة البيانات غير متاح من الواجهة.'); };
  return <DemoContext.Provider value={{ ...state, login, setupSystemAdmin, setEmployeePassword, saveQrDisplayAccount, prepareSystemBackup, logout, refresh, discardDraft, resetDemo, updateData, notify }}>{children}{toast && <div key={toast.id} className="toast" role="status" aria-live="polite"><Check size={20}/><span>{toast.message}</span></div>}</DemoContext.Provider>;
}

export function DemoProvider({ children, backend = 'local' }: { children: ReactNode; backend?: 'local' | 'neon' }) {
  // The production branch never initializes, reads, copies, or removes the
  // legacy browser-local stores. They remain available for backup recovery.
  return backend === 'neon' ? <RemoteDemoProvider>{children}</RemoteDemoProvider> : <LocalDemoProvider>{children}</LocalDemoProvider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context; }
export function useToast() { return useDemo().notify; }
