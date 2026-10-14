'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, UsersRound } from 'lucide-react';
import styles from './evaluations.module.css';

export function MultiEmployeeFilter({ selected, onChange, employeeIds }: { selected: string[]; onChange: (ids: string[]) => void; employeeIds: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpen = useRef<'first' | 'last' | null>(null);
  const selectedSet = new Set(selected);

  // Synchronize fixed portal geometry directly with the measured DOM. Using
  // the actual content height keeps a short list next to its trigger above it.
  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return false;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const gap = 7;
    const margin = 12;
    const minLeft = (viewport?.offsetLeft ?? 0) + margin;
    const minTop = (viewport?.offsetTop ?? 0) + margin;
    const maxRight = minLeft + (viewport?.width ?? window.innerWidth) - margin * 2;
    const maxBottom = minTop + (viewport?.height ?? window.innerHeight) - margin * 2;
    if (rect.bottom <= minTop || rect.top >= maxBottom || rect.right <= minLeft || rect.left >= maxRight) {
      panel.style.visibility = 'hidden';
      return false;
    }
    const width = Math.max(0, Math.min(rect.width, maxRight - minLeft));
    panel.style.width = `${width}px`;
    const panelStyle = getComputedStyle(panel);
    const contentHeight = panel.scrollHeight + parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth);
    const below = Math.max(0, maxBottom - rect.bottom - gap);
    const above = Math.max(0, rect.top - minTop - gap);
    const preferredHeight = Math.min(320, contentHeight);
    const placeAbove = below < preferredHeight && above > below;
    const maxHeight = Math.min(320, placeAbove ? above : below);
    const height = Math.min(contentHeight, maxHeight);
    const left = Math.max(minLeft, Math.min(rect.left, maxRight - width));
    const top = placeAbove ? rect.top - gap - height : rect.bottom + gap;
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(minTop, Math.min(top, maxBottom - height))}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.visibility = 'visible';
    panel.dataset.side = placeAbove ? 'top' : 'bottom';
    return true;
  }, []);

  function controls() {
    return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
  }

  function focusControl(edge: 'first' | 'last') {
    const items = controls();
    const target = edge === 'first' ? items[0] : items.at(-1);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }

  useLayoutEffect(() => {
    if (!open) return;
    if (!updatePlacement()) return;
    if (focusOnOpen.current) {
      focusControl(focusOnOpen.current);
      focusOnOpen.current = null;
    }
  });

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node && (triggerRef.current?.contains(target) || panelRef.current?.contains(target));
    const dismissOutside = (event: Event) => { if (!inside(event.target)) setOpen(false); };
    const update = (event?: Event) => {
      // Scrolling options must not reposition or dismiss their own popover.
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (!updatePlacement()) setOpen(false);
    };
    const observer = new ResizeObserver(() => update());
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open, updatePlacement]);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.target === triggerRef.current) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const edge = event.key === 'ArrowDown' ? 'first' : 'last';
        if (open) focusControl(edge);
        else { focusOnOpen.current = edge; setOpen(true); }
      } else if (event.key === 'Tab' && open) {
        if (event.shiftKey) setOpen(false);
        else { event.preventDefault(); focusControl('first'); }
      }
      return;
    }
    if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) return;
    const items = controls();
    const index = items.indexOf(event.target as HTMLElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
      items[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Tab' && event.shiftKey && index === 0) {
      event.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
    } else if (event.key === 'Tab' && !event.shiftKey && index === items.length - 1) {
      // Restore the page's natural tab order across the body portal.
      const pageControls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(item => !panelRef.current?.contains(item) && item.tabIndex >= 0 && item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden' && !item.closest('[inert]'));
      const next = pageControls[pageControls.indexOf(triggerRef.current!) + 1];
      if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
      setOpen(false);
    }
  }

  return <div className={styles.multiSelect} onKeyDown={handleKeys}>
    <button ref={triggerRef} className={styles.multiButton} type="button" onClick={() => setOpen(value => !value)} aria-label="اختيار المصححين" aria-expanded={open} aria-controls={panelId}><span className="inline"><UsersRound size={17}/>{selected.length === employeeIds.length ? 'كل المصححين' : `${selected.length} مصححين محددين`}</span><ChevronDown size={16}/></button>
    {open && createPortal(<div ref={panelRef} id={panelId} role="group" aria-label="المصححون المختارون" className={styles.multiPanel} style={{ position: 'fixed' }}><div className={styles.multiActions}><button className="button-link" type="button" onClick={() => onChange(employeeIds.map(item => item.id))}>تحديد الكل</button><button className="button-link" type="button" onClick={() => onChange([])}>إلغاء التحديد</button></div>{employeeIds.map(item => <label className={styles.multiOption} key={item.id}><input type="checkbox" checked={selectedSet.has(item.id)} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/><span>{item.name}</span></label>)}</div>, document.body)}
  </div>;
}
