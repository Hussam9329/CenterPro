'use client';

import { createContext, useContext, useId, type ComponentProps, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';

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
