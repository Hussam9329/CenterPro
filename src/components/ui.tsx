'use client';

import type { ButtonHTMLAttributes, ComponentProps, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { createContext, useContext, useId } from 'react';
import * as D from '@radix-ui/react-dialog';
import Image from 'next/image';
import { X, Search, ChevronRight, ChevronLeft, Inbox, LoaderCircle } from 'lucide-react';

export function Button({ variant = 'primary', loading, className = '', children, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button {...props} type={type} disabled={disabled || loading} className={`btn btn-${variant} ${className}`}>{loading && <LoaderCircle className="spin" size={17}/>} {children}</button>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot"/>{children}</span>;
}
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
export function Card({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{(title || action) && <div className="card-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}{children}</section>;
}
export function StatCard({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span>{icon && <span className="stat-icon">{icon}</span>}</div><div className="stat-value">{value}</div>{hint && <div className="stat-hint">{hint}</div>}</div>;
}
const FieldContext = createContext<{ id:string; labelId:string; descriptionId?:string; invalid:boolean; required?:boolean } | null>(null);
export function Field({ label, children, hint, error, required }: { label: string; children: ReactNode; hint?: string; error?: string; required?: boolean }) {
  const id = useId();
  const value = { id, labelId:`${id}-label`, descriptionId: error || hint ? `${id}-description` : undefined, invalid:!!error, required };
  return <FieldContext.Provider value={value}><div className="field"><label className="field-label" htmlFor={id}><span id={value.labelId}>{label}</span>{required && <span className="text-brand" aria-hidden="true"> *</span>}</label>{children}{error ? <span id={value.descriptionId} className="field-error" role="alert">{error}</span> : hint && <span id={value.descriptionId} className="field-hint">{hint}</span>}</div></FieldContext.Provider>;
}
function useFieldProps() { const context = useContext(FieldContext); return context ? { id:context.id, 'aria-labelledby':context.labelId, 'aria-describedby':context.descriptionId, 'aria-invalid':context.invalid || undefined, required:context.required } : {}; }
export function Input({ className = '', ...props }: ComponentProps<'input'>) { const fieldProps=useFieldProps(); return <input {...fieldProps} {...props} className={`input ${className}`}/>; }
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) { const fieldProps=useFieldProps(); return <select {...fieldProps} {...props} className={`input select ${className}`}/>; }
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { const fieldProps=useFieldProps(); return <textarea {...fieldProps} {...props} className={`input textarea ${className}`}/>; }
export function Dialog({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return <D.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><D.Portal><D.Overlay className="dialog-overlay"/><D.Content className={`dialog-content ${wide ? 'dialog-wide' : ''}`} dir="rtl" aria-describedby={description ? undefined : undefined}><div className="dialog-header"><div><D.Title>{title}</D.Title>{description && <D.Description>{description}</D.Description>}</div><D.Close className="icon-button" aria-label="إغلاق النافذة"><X size={20}/></D.Close></div>{!description && <D.Description className="sr-only">{title}</D.Description>}<div className="dialog-body">{children}</div></D.Content></D.Portal></D.Root>;
}
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'تأكيد', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; danger?: boolean }) {
  return <Dialog open={open} onClose={onClose} title={title} description={description}><div className="form-actions"><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button><Button variant="secondary" onClick={onClose}>إلغاء</Button></div></Dialog>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Inbox size={26}/></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string; size?: string | number }) { const style = typeof size === 'number' ? { width: size, height: size } : undefined; return <span className={`avatar avatar-${size}`} style={style}>{src ? <Image src={src} alt={name} width={80} height={80} unoptimized/> : name.split(' ').slice(0,2).map(s => s[0]).join('')}</span>; }
export function SearchInput({ value, onChange, placeholder = 'بحث...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="search-input"><Search size={18}/><Input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/>{value && <button aria-label="مسح البحث" className="search-clear" onClick={() => onChange('')}><X size={15}/></button>}</div>; }
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); return <div className="pagination"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} من ${total}` : '0 نتائج'}</span><div className="inline"><Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة"><ChevronRight size={16}/></Button><span>{page} / {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية"><ChevronLeft size={16}/></Button></div></div>; }
export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} aria-hidden="true"/>; }
export function Tabs({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) { return <div className="tabs" aria-label="أقسام الصفحة">{items.map(item => <button key={item.value} type="button" className={value === item.value ? 'active' : ''} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>; }
