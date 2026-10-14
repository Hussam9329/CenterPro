import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import type { useDemo } from '@/components/demo-provider';
import type { Workday } from '@/lib/types';

type QrOptions = {
  interval: number;
  day?: Workday;
  backend: ReturnType<typeof useDemo>['backend'];
  ready: boolean;
  session: ReturnType<typeof useDemo>['session'];
};

/** Rotates remote tokens using server time; preview QR stays browser-local. */
export function useAttendanceQr({ interval, day, backend, ready, session }: QrOptions) {
  const [clock, setClock] = useState({ now: 0, issuedAt: 0 });
  const [qr, setQr] = useState<{ token: string; expiresAt: number; serverTime: number; workdayId: string; offset: number } | null>(null);
  const [qrError, setQrError] = useState('');
  const dayKey = day ? JSON.stringify(day) : null;
  const sessionRole = session?.role;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(previous => ({ now, issuedAt: !previous.issuedAt || now - previous.issuedAt >= interval * 1000 ? now : previous.issuedAt }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [interval]);
  useEffect(() => {
    if (backend !== 'neon' || !ready || !sessionRole || sessionRole === 'EMPLOYEE' || !dayKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function rotate() {
      try {
        const fresh = await apiRequest<{ token: string; expiresAt: number; serverTime: number; workdayId: string }>('/api/qr');
        if (cancelled) return;
        setQr({ ...fresh, offset: fresh.serverTime - Date.now() });
        setQrError('');
        timer = setTimeout(rotate, Math.max(1000, fresh.expiresAt - fresh.serverTime - 1000));
      } catch (cause) {
        if (cancelled) return;
        setQr(null);
        setQrError(cause instanceof Error ? cause.message : 'تعذر تحديث رمز الحضور.');
        timer = setTimeout(rotate, 5000);
      }
    }
    void rotate();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [backend, ready, sessionRole, dayKey, interval]);
  const remaining = backend === 'neon'
    ? Math.max(0, Math.ceil(((qr?.expiresAt ?? 0) - (clock.now ? clock.now + (qr?.offset ?? 0) : qr?.serverTime ?? 0)) / 1000))
    : Math.max(0, interval - Math.floor((clock.now - clock.issuedAt) / 1000));
  const payload = backend === 'neon' ? qr?.token ?? '' : JSON.stringify({ preview: 'CENTERPRO_PREVIEW', workdayId: day?.id, issuedAt: clock.issuedAt, expiresAt: clock.issuedAt + interval * 1000, nonce: `preview-${clock.issuedAt}` });
  return { clock, qr, qrError, remaining, payload };
}
