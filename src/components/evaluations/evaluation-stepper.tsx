'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { safeNumber } from './editor-values';
import styles from './evaluations.module.css';

export function EvaluationStepper({ label, value, disabled, onImmediate, onType, onBlur }: { label: string; value: string; disabled?: boolean; onImmediate: (value: number) => void; onType: (value: string) => void; onBlur: () => void }) {
  const id = useId();
  const numeric = safeNumber(value);
  return <div className={styles.numericField}><label className={styles.numericLabel} htmlFor={id}>{label}</label><div className={styles.stepper}><button type="button" disabled={disabled || (numeric ?? 0) <= 0} onClick={() => onImmediate(Math.max(0, (numeric ?? 0) - 1))} aria-label={`إنقاص ${label}`}><Minus size={18}/></button><input id={id} inputMode="numeric" pattern="[0-9]*" value={value} placeholder="0" disabled={disabled} onChange={event => onType(event.target.value.replace(/\D/g, ''))} onBlur={onBlur}/><button type="button" disabled={disabled || numeric === Number.MAX_SAFE_INTEGER} onClick={() => onImmediate((numeric ?? 0) + 1)} aria-label={`زيادة ${label}`}><Plus size={18}/></button></div></div>;
}
