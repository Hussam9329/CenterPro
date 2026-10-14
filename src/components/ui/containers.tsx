'use client';

import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>{actions && <div className="page-actions">{actions}</div>}</header>;
}

export function Card({ title, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{(title || action) && <div className="card-heading"><div>{title && <h2>{title}</h2>}</div>{action}</div>}{children}</section>;
}

export function StatCard({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return <div className={`stat-card ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span>{icon && <span className="stat-icon">{icon}</span>}</div><div className="stat-value">{value}</div>{hint && <div className="stat-hint">{hint}</div>}</div>;
}
