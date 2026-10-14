'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { useTheme } from '@/components/theme-provider';
import type { Role } from '@/lib/types';
import styles from './calculator.module.css';

type Operation = '+' | '-' | '×' | '÷' | null;

function trimDisplay(value: number) {
  if (!Number.isFinite(value)) return 'خطأ';
  const abs = Math.abs(value);
  if ((abs !== 0 && abs >= 1e10) || (abs !== 0 && abs < 1e-8)) return value.toExponential(6).replace(/\.0+e/, 'e');
  return Number(value.toFixed(10)).toString();
}

function calculate(left: number, right: number, operation: Operation) {
  if (operation === '+') return left + right;
  if (operation === '-') return left - right;
  if (operation === '×') return left * right;
  if (operation === '÷') return right === 0 ? Number.NaN : left / right;
  return right;
}

function returnPath(role: Role) {
  const fallback = role === 'QR_DISPLAY' ? '/attendance-display' : role === 'EMPLOYEE' ? '/employee' : '/dashboard';
  const requested = new URLSearchParams(window.location.search).get('returnTo');
  if (!requested?.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(requested)) return fallback;
  try {
    const url = new URL(requested, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    const employeeRoute = /^\/employee(?:\/(?:attendance|audit|evaluation|profile|salary|scan))?\/?$/;
    const adminRoute = /^\/(?:dashboard|employees(?:\/[^/]+)?|attendance(?:\/[^/]+)?|evaluations(?:\/[^/]+)?|payroll|deductions|bonuses|reports|workdays|attendance-display)\/?$/;
    const privilegedRoute = /^\/(?:departments|audit|settings)\/?$/;
    const allowed = role === 'QR_DISPLAY' ? url.pathname === '/attendance-display'
      : role === 'EMPLOYEE' ? employeeRoute.test(url.pathname)
      : adminRoute.test(url.pathname) || (role === 'SUPER_ADMIN' && privilegedRoute.test(url.pathname));
    return allowed ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export default function CalculatorPage() {
  const { ready, session } = useDemo();
  const { theme } = useTheme();
  const router = useRouter();
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [operation, setOperation] = useState<Operation>(null);
  const [waiting, setWaiting] = useState(false);
  const [freshResult, setFreshResult] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace('/login');
    else if (ready && session?.role === 'QR_DISPLAY') router.replace('/attendance-display');
  }, [ready, router, session]);

  const numericValue = useMemo(() => Number(display === 'خطأ' ? 0 : display), [display]);

  function clearAll() {
    setDisplay('0');
    setStored(null);
    setOperation(null);
    setWaiting(false);
    setFreshResult(false);
  }

  function clearKey() {
    if (display === '0' || display === 'خطأ') clearAll();
    else { setDisplay('0'); setWaiting(false); setFreshResult(false); }
  }

  function inputDigit(digit: string) {
    if (display === 'خطأ' || waiting || freshResult) {
      setDisplay(digit);
      setWaiting(false);
      setFreshResult(false);
      return;
    }
    if (display === '0') setDisplay(digit);
    else if (display === '-0') setDisplay(`-${digit}`);
    else if (display.replace('-', '').replace('.', '').length < 12) setDisplay(display + digit);
  }

  function inputDecimal() {
    if (display === 'خطأ' || waiting || freshResult) {
      setDisplay('0.');
      setWaiting(false);
      setFreshResult(false);
      return;
    }
    if (!display.includes('.')) setDisplay(display + '.');
  }

  function chooseOperation(next: Exclude<Operation, null>) {
    if (display === 'خطأ') return clearAll();
    const current = Number(display);
    if (stored !== null && operation && !waiting) {
      const result = calculate(stored, current, operation);
      const text = trimDisplay(result);
      setDisplay(text);
      setStored(Number.isFinite(result) ? result : null);
      if (!Number.isFinite(result)) {
        setOperation(null);
        setWaiting(false);
        return;
      }
    } else {
      setStored(current);
    }
    setOperation(next);
    setWaiting(true);
    setFreshResult(false);
  }

  function equals() {
    if (stored === null || !operation || display === 'خطأ') return;
    const result = calculate(stored, Number(display), operation);
    setDisplay(trimDisplay(result));
    setStored(null);
    setOperation(null);
    setWaiting(false);
    setFreshResult(true);
  }

  function toggleSign() {
    if (display === 'خطأ') return;
    if (waiting) {
      setDisplay('-0');
      setWaiting(false);
      setFreshResult(false);
      return;
    }
    setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
  }

  function percent() {
    if (display === 'خطأ') return;
    setDisplay(trimDisplay(numericValue / 100));
    setFreshResult(true);
  }

  function backspace() {
    if (display === 'خطأ' || waiting || freshResult) return clearAll();
    if (display.length <= 1 || (display.startsWith('-') && display.length === 2)) setDisplay('0');
    else setDisplay(display.slice(0, -1));
  }

  useEffect(() => {
    if (!ready || !session) return;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select')) return;
      const key = event.key;
      // Enter activates the focused control; it evaluates only from the display/page.
      if (key === 'Enter' && target?.closest('button, a, [role="button"]')) return;
      if (/^[0-9]$/.test(key)) { event.preventDefault(); inputDigit(key); return; }
      if (key === '.' || key === ',') { event.preventDefault(); inputDecimal(); return; }
      if (key === '+') { event.preventDefault(); chooseOperation('+'); return; }
      if (key === '-') { event.preventDefault(); chooseOperation('-'); return; }
      if (key === '*' || key.toLowerCase() === 'x') { event.preventDefault(); chooseOperation('×'); return; }
      if (key === '/') { event.preventDefault(); chooseOperation('÷'); return; }
      if (key === 'Enter' || key === '=') { event.preventDefault(); equals(); return; }
      if (key === 'Escape') { event.preventDefault(); clearAll(); return; }
      if (key === 'Backspace') { event.preventDefault(); backspace(); return; }
      if (key === '%') { event.preventDefault(); percent(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ready || !session || session.role === 'QR_DISPLAY') return null;

  const button = (label: string, action: () => void, kind: 'utility' | 'operation' | 'number' = 'number', wide = false, active = false) => (
    <button type="button" className={`${styles.key} ${styles[kind]} ${wide ? styles.wide : ''} ${active ? styles.active : ''}`} onClick={action} aria-label={label}>{label}</button>
  );

  return <main id="main-content" tabIndex={-1} className={styles.page} data-theme={theme}>
    <button className={styles.back} type="button" onClick={() => router.replace(returnPath(session.role))}><ArrowRight size={20}/>رجوع</button>
    <section className={styles.shell} aria-label="الحاسبة">
      <output className={styles.display} aria-label="نتيجة الحاسبة" aria-live="polite" dir="ltr" style={{ '--display-length': display.length } as CSSProperties}>{display}</output>
      <div className={styles.keys}>
        {button(display === '0' && stored === null ? 'AC' : 'C', clearKey, 'utility')}
        {button('±', toggleSign, 'utility')}
        {button('%', percent, 'utility')}
        {button('÷', () => chooseOperation('÷'), 'operation', false, operation === '÷' && waiting)}
        {button('7', () => inputDigit('7'))}{button('8', () => inputDigit('8'))}{button('9', () => inputDigit('9'))}{button('×', () => chooseOperation('×'), 'operation', false, operation === '×' && waiting)}
        {button('4', () => inputDigit('4'))}{button('5', () => inputDigit('5'))}{button('6', () => inputDigit('6'))}{button('−', () => chooseOperation('-'), 'operation', false, operation === '-' && waiting)}
        {button('1', () => inputDigit('1'))}{button('2', () => inputDigit('2'))}{button('3', () => inputDigit('3'))}{button('+', () => chooseOperation('+'), 'operation', false, operation === '+' && waiting)}
        {button('0', () => inputDigit('0'), 'number', true)}{button('.', inputDecimal)}{button('=', equals, 'operation')}
      </div>
    </section>
  </main>;
}
