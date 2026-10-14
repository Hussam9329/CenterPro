'use client';

import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

export function Button({ variant = 'primary', loading, className = '', children, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button {...props} type={type} disabled={disabled || loading} className={`btn btn-${variant} ${className}`}>{loading && <LoaderCircle className="spin" size={17}/>} {children}</button>;
}
