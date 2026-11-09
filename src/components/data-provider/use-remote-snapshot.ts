import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteSnapshot, RemoteUnchanged } from '@/lib/server-contract';
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
      const held = current.current;
      // Background polls send the held revision; the server then skips the full document when nothing changed.
      const known = background && held.ready && held.session && typeof held.revision === 'number' ? held.revision : null;
      const response = await remoteRequest<RemoteSnapshot | RemoteUnchanged>(known === null ? '/api/state' : `/api/state?revision=${known}`);
      if ('unchanged' in response) {
        if (sequence !== operation.current || changing.current) return;
        if (sameAccount(response.session, current.current.session) && response.revision === current.current.revision) {
          publishRemote({ ...current.current, today: response.today, month: response.month, serverTime: response.serverTime, remembered: response.remembered, connectionError: undefined });
          return;
        }
      }
      // A different account or revision since the request was sent: read the whole document.
      const next = 'unchanged' in response ? await remoteRequest<RemoteSnapshot>('/api/state') : response;
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
    const timer = window.setInterval(load, 60_000);
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
