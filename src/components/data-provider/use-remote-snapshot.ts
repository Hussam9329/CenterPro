import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteSnapshot } from '@/lib/server-contract';
import type { RemoteDrafts } from './remote-drafts';
import { remoteRequest } from './remote-request';
import { sameAccount, serverSnapshot } from './snapshot';
import type { Snapshot } from './types';

const initialSnapshot: Snapshot = { ...serverSnapshot, backend: 'neon', today: '', month: '', pendingImport: false };

/** Keeps reads behind the same operation and revision guards as writes. */
export function useRemoteSnapshot(drafts: RemoteDrafts) {
  const [state, setState] = useState<Snapshot>(initialSnapshot);
  const current = useRef<Snapshot>(initialSnapshot);
  const operation = useRef(0);
  const changing = useRef(false);
  const publishRemote = useCallback((next: Snapshot) => {
    current.current = next;
    setState(next);
  }, []);
  const beginChange = useCallback(() => {
    changing.current = true;
    operation.current += 1;
  }, []);
  const endChange = useCallback(() => { changing.current = false; }, []);
  const refreshState = useCallback(async (background = false) => {
    const sequence = operation.current;
    try {
      const next = await remoteRequest<RemoteSnapshot>('/api/state');
      if (sequence === operation.current && !changing.current) {
        if (current.current.ready && sameAccount(next.session, current.current.session) && next.revision < (current.current.revision ?? 0)) return;
        const editing = drafts.isEditing();
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
  }, [drafts, publishRemote]);
  const refresh = useCallback(() => refreshState(), [refreshState]);

  useEffect(() => {
    let active = true;
    const load = () => { if (active && !changing.current && document.visibilityState !== 'hidden') void refreshState(true).catch(() => {}); };
    load();
    const timer = window.setInterval(load, 15_000);
    document.addEventListener('input', drafts.markEdited);
    document.addEventListener('change', drafts.markEdited);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', load);
      document.removeEventListener('input', drafts.markEdited);
      document.removeEventListener('change', drafts.markEdited);
    };
  }, [drafts, refreshState]);

  return { state, current, changing, beginChange, endChange, publishRemote, refresh };
}
