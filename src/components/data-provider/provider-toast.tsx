import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

type Toast = { id: number; message: string } | null;

export function useProviderToast() {
  const [toast, setToast] = useState<Toast>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string) => setToast({ id: ++sequence.current, message }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, notify };
}

export function ProviderToast({ toast }: { toast: Toast }) {
  return toast && <div key={toast.id} className="toast" role="status" aria-live="polite"><Check size={20}/><span>{toast.message}</span></div>;
}
