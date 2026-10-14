'use client';

import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot"/>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Inbox size={26}/></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} aria-hidden="true"/>; }
