'use client';

import { useState, type ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './button';

export function Dialog({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return <D.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><D.Portal><D.Overlay className="dialog-overlay"/><D.Content className={`dialog-content ${wide ? 'dialog-wide' : ''}`} dir="rtl" aria-describedby={description ? undefined : undefined}><div className="dialog-header"><div><D.Title>{title}</D.Title>{description && <D.Description>{description}</D.Description>}</div><D.Close className="icon-button" aria-label="إغلاق النافذة"><X size={20}/></D.Close></div>{!description && <D.Description className="sr-only">{title}</D.Description>}<div className="dialog-body">{children}</div></D.Content></D.Portal></D.Root>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'تأكيد', danger }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: string; description: string; confirmLabel?: string; danger?: boolean }) {
  const [loading, setLoading] = useState(false);
  async function confirm() {
    if (loading) return;
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  }
  return <Dialog open={open} onClose={() => { if (!loading) onClose(); }} title={title} description={description}><div className="form-actions"><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={confirm}>{confirmLabel}</Button><Button variant="secondary" disabled={loading} onClick={onClose}>إلغاء</Button></div></Dialog>;
}
