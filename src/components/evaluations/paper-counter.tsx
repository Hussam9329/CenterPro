'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { safeNumber } from './editor-values';
import styles from './evaluations.module.css';

const digits = (value: string) => value.replace(/\D/g, '');

/**
 * Corrected papers are entered as batches: type a number, press Enter or +,
 * and it is added to the total. Each added number stays visible as a chip
 * that can be corrected or removed.
 */
export function PaperCounter({ total, batches, disabled, onChange }: { total: string; batches: number[]; disabled: boolean; onChange: (next: number[]) => void }) {
  const inputId = useId();
  const labelId = useId();
  const [entry, setEntry] = useState('');
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const entryValue = safeNumber(entry);

  function add() {
    if (disabled || entryValue === null) return;
    onChange([...batches, entryValue]);
    setEntry('');
  }
  function onEntryKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  }
  function commitEdit() {
    if (!editing) return;
    const value = safeNumber(editing.text);
    const next = [...batches];
    if (value === null) next.splice(editing.index, 1);
    else next[editing.index] = value;
    setEditing(null);
    if (value !== batches[editing.index]) onChange(next);
  }
  function onEditKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); commitEdit(); }
    if (event.key === 'Escape') { event.preventDefault(); setEditing(null); }
  }

  return <div className={`${styles.numericField} ${styles.paperField}`} role="group" aria-labelledby={labelId}>
    <div className={styles.paperHead}>
      <span className={styles.numericLabel} id={labelId}>عدد الأوراق المصححة</span>
      <span className={styles.paperTotal} data-paper-total aria-live="polite"><span className="sr-only">المجموع </span><bdi dir="ltr">{total || '0'}</bdi></span>
    </div>
    <div className={styles.paperAdd}>
      <input id={inputId} inputMode="numeric" pattern="[0-9]*" value={entry} placeholder="أضف عدداً ثم Enter" aria-label="إضافة أوراق مصححة" disabled={disabled} enterKeyHint="done" onChange={event => setEntry(digits(event.target.value))} onKeyDown={onEntryKey} onBlur={add}/>
      <button type="button" aria-label="إضافة إلى الأوراق المصححة" disabled={disabled || entryValue === null} onMouseDown={event => event.preventDefault()} onClick={add}><Plus size={18}/></button>
    </div>
    {batches.length > 0 && <ul className={styles.paperChips} aria-label="الأعداد المضافة">
      {batches.map((value, index) => disabled
        ? <li key={index} className={styles.paperChip}><span className={styles.paperChipValue}><bdi dir="ltr">{value}</bdi></span></li>
        : <li key={index} className={styles.paperChip} data-editing={editing?.index === index || undefined}>
        {editing?.index === index
          ? <input autoFocus inputMode="numeric" pattern="[0-9]*" aria-label={`تعديل العدد ${index + 1}`} value={editing.text} onChange={event => setEditing({ index, text: digits(event.target.value) })} onKeyDown={onEditKey} onBlur={commitEdit}/>
          : <button type="button" className={styles.paperChipValue} disabled={disabled} aria-label={`تعديل العدد ${index + 1}: ${value}`} onClick={() => setEditing({ index, text: String(value) })}><bdi dir="ltr">{value}</bdi></button>}
        <button type="button" className={styles.paperChipRemove} disabled={disabled} aria-label={`حذف العدد ${index + 1}: ${value}`} onMouseDown={event => event.preventDefault()} onClick={() => { setEditing(null); onChange(batches.filter((_, item) => item !== index)); }}><X size={13}/></button>
      </li>)}
    </ul>}
  </div>;
}
