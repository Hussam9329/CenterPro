'use client';

import { X, Search, ChevronRight, ChevronLeft } from 'lucide-react';
import { Input } from './fields';
import { Button } from './button';

export function SearchInput({ value, onChange, placeholder = 'بحث...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="search-input"><Search size={18}/><Input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/>{value && <button aria-label="مسح البحث" className="search-clear" onClick={() => onChange('')}><X size={15}/></button>}</div>; }

export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) { const pages = Math.max(1, Math.ceil(total / pageSize)); return <div className="pagination"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} من ${total}` : '0 نتائج'}</span><div className="inline"><Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة"><ChevronRight size={16}/></Button><span>{page} / {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية"><ChevronLeft size={16}/></Button></div></div>; }

export function Tabs({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) { return <div className="tabs" aria-label="أقسام الصفحة">{items.map(item => <button key={item.value} type="button" className={value === item.value ? 'active' : ''} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>; }
