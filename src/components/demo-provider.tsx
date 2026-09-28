'use client';

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { createInitialData } from '@/lib/mock-data';
import type { DemoData, DemoSession, Role, AuditInput } from '@/lib/types';

const STORAGE_KEY = 'centerpro-ui-preview-v1';
interface Snapshot { data: DemoData; session: DemoSession | null; ready: boolean }
const serverSnapshot: Snapshot = { data: createInitialData(), session: null, ready: false };
let snapshot = serverSnapshot;
let initialized = false;
const listeners = new Set<() => void>();
function emit(next: Snapshot) {
  snapshot = next;
  if (typeof window !== 'undefined' && next.ready) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: next.data, session: next.session })); } catch { /* Preview remains usable if storage is blocked. */ }
  }
  listeners.forEach(listener => listener());
}
function initialize() {
  if (initialized) return;
  initialized = true;
  let next: Snapshot = { ...serverSnapshot, data: createInitialData(), ready: true };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored.version === 1 && Array.isArray(stored.data?.employees) && Array.isArray(stored.data?.months) && Array.isArray(stored.data?.audit)) {
        next = { data: stored.data, session: stored.session, ready: true };
      }
    }
  } catch { /* Invalid preview storage is safely reset. */ }
  emit(next);
}
function subscribe(listener: () => void) { listeners.add(listener); queueMicrotask(initialize); return () => { listeners.delete(listener); }; }
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
interface DemoContextValue extends Snapshot {
  login: (role: Role) => void;
  logout: () => void;
  resetDemo: () => void;
  updateData: (updater: (draft: DemoData) => void, audit?: AuditInput) => void;
  notify: (message: string) => void;
}
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => { setToast(message); }, []);
  function login(role: Role) {
    const user = snapshot.data.employees.find(employee => employee.role === role && employee.active);
    if (!user) return;
    emit({ ...snapshot, session: { role, employeeId: user.id, name: user.name } });
  }
  function logout() { emit({ ...snapshot, session: null }); }
  function resetDemo() { emit({ data: createInitialData(), session: snapshot.session, ready: true }); notify('تمت إعادة البيانات التجريبية إلى حالتها الأصلية.'); }
  function updateData(updater: (draft: DemoData) => void, audit?: AuditInput) {
    const draft = structuredClone(snapshot.data);
    updater(draft);
    if (audit && snapshot.session) {
      draft.audit.unshift({ id: crypto.randomUUID(), actor: snapshot.session.name, role: snapshot.session.role, action: audit.action, entity: audit.entity, entityId: audit.entityId, employeeId: audit.employeeId, oldValues: audit.oldValues || {}, newValues: audit.newValues || {}, timestamp: new Date().toISOString(), userAgent: 'معاينة واجهات CenterPro' });
    }
    emit({ ...snapshot, data: draft });
  }
  return <DemoContext.Provider value={{ ...state, login, logout, resetDemo, updateData, notify }}>{children}{toast && <div className="toast" role="status"><Check size={20}/><span>{toast}</span><button onClick={() => setToast('')} aria-label="إغلاق الإشعار"><X size={17}/></button></div>}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context; }
export function useToast() { return useDemo().notify; }
