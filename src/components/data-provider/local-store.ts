import { createInitialData, DEMO_TODAY, DEMO_MONTH } from '@/lib/mock-data';
import type { MutationOptions } from '@/lib/server-contract';
import { applyDeletionPlan, authorizeDeletion, getDeletionPlan } from '@/lib/safe-deletion';
import { assertSingleOpenWorkday } from '@/lib/attendance';
import { canManageEmployeeAccount } from '@/lib/permissions';
import { assertEvaluationMutation, assertEvaluationState } from '@/lib/evaluations';
import { PREVIEW_DATA_STORAGE_KEY, PREVIEW_PERSISTENT_STORAGE_KEY, PREVIEW_STORAGE_KEY, PREVIEW_STORAGE_VERSION, PREVIEW_SYSTEM_ADMIN, PREVIEW_SYSTEM_USERNAME } from '@/lib/preview-config';
import { AUTH_STORAGE_KEY, clearEmployeeCredentials, configureSystemCredential, normalizeUsername, removeEmployeeCredential, readAuthStore, readAuthStoreForBackup, setEmployeeCredential, verifyCredential } from '@/lib/local-auth';
import { createSystemBackup } from '@/lib/system-backup';
import type { DemoData, DemoSession, AuditInput } from '@/lib/types';
import { sameAccount, serverSnapshot } from './snapshot';
import type { AuditSource, DataUpdater, Snapshot } from './types';

// This singleton must stay shared across provider mounts and storage events.
const collections: Array<keyof DemoData> = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'];
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
export function subscribe(listener: () => void) { listeners.add(listener); queueMicrotask(initialize); return () => { listeners.delete(listener); }; }
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => serverSnapshot;

export async function login(username: string, password: string, remember = false) {
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

export async function setupSystemAdmin(username: string, password: string, remember = false) {
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

export async function setEmployeePassword(employeeId: string, password: string, onChanged?: () => void | Promise<void>) {
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

export async function saveQrDisplayAccount() {
  throw new Error('إدارة حساب شاشة الحضور متاحة عند الاتصال بقاعدة البيانات.');
}

export async function prepareSystemBackup(theme: 'light' | 'dark') {
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

export async function logout() { authOperation += 1; emit({ ...snapshot, session: null, remembered: false }, true); }
export function resetDemo() {
  authOperation += 1;
  clearEmployeeCredentials();
  const auth = readAuthStore();
  emit({ backend: 'local', today: DEMO_TODAY, month: DEMO_MONTH, pendingImport: false, data: createInitialData(), session: auth.system ? { ...PREVIEW_SYSTEM_ADMIN, authVersion: auth.system.version } : null, ready: true, remembered: false, ...authMeta() }, true);
}
export async function updateData(updater: DataUpdater, auditSource?: AuditSource, options?: MutationOptions) {
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
