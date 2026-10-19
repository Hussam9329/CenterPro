'use client';

import { Children, isValidElement, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

export function Button({ variant = 'primary', loading, className = '', children, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  // Icon-only buttons (no text children) get a round style; CSS alone cannot see text nodes.
  const parts = Children.toArray(children);
  const iconOnly = parts.length === 1 && isValidElement(parts[0]);
  return <button {...props} type={type} disabled={disabled || loading} className={`btn btn-${variant}${iconOnly ? ' btn-icon' : ''} ${className}`}>{loading && <LoaderCircle className="spin" size={17}/>} {children}</button>;
}
