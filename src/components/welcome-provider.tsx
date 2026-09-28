'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './welcome.module.css';

export const WELCOME_DURATION_MS = 5000;

interface WelcomeContextValue {
  active: boolean;
  /** Await this after successful authentication, before navigating to the destination. */
  showWelcome: () => Promise<void>;
}

const WelcomeContext = createContext<WelcomeContextValue | null>(null);

/** The source paths and wordmark retain the geometry of public/brand/logo.svg. */
function WelcomeLogo() {
  const id = useId();
  const titleId = `${id}-title`;
  const wordmarkId = `${id}-wordmark`;

  return <svg className={styles.logo} viewBox="180 205 175 51" width="175" height="51" role="img" aria-labelledby={titleId}>
    <title id={titleId}>CenterPro</title>
    <defs><clipPath id={wordmarkId}><rect x="230" y="205" width="125" height="51" /></clipPath></defs>
    <g transform="matrix(.29062499,0,0,.29062499,179.45066,207.32953)" fill="none" strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="4">
      <path className={styles.letterC} pathLength="1" stroke="#A51C30" strokeWidth="22" d="M111 29C86.59874 15.78387 56.25467 21.703885 38.6106 43.122903 20.966528 64.541919 20.966528 95.458087 38.6106 116.8771 56.25467 138.29611 86.59874 144.21613 111 131" />
      <path className={styles.letterP} pathLength="1" stroke="#111318" strokeWidth="18" d="M79 45V119" />
      <path className={styles.letterP} pathLength="1" stroke="#111318" strokeWidth="18" d="M79 52H108C126 52 136 62 136 78 136 95 125 105 107 105H79" />
    </g>
    <image className={styles.wordmark} clipPath={`url(#${wordmarkId})`} href="/brand/logo.svg" x="180" y="205" width="175" height="51" />
  </svg>;
}

export function WelcomeProvider({ children }: { children: ReactNode }) {
  // The initial server render already covers the application, before hydration.
  const [active, setActive] = useState(true);
  const [timerStarted, setTimerStarted] = useState(false);
  const [sequence, setSequence] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  const mounted = useRef(false);
  const overlay = useRef<HTMLDivElement | null>(null);

  const complete = useCallback(() => {
    timer.current = null;
    if (mounted.current) {
      setActive(false);
      setTimerStarted(false);
    }
    pending.current?.resolve();
    pending.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    timer.current = setTimeout(complete, WELCOME_DURATION_MS);
    // This lifecycle marker also makes timer-based accessibility/QA checks deterministic.
    queueMicrotask(() => {
      if (!cancelled) {
        setTimerStarted(true);
        overlay.current?.focus({ preventScroll: true });
      }
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      // A caller waiting for a welcome transition must not retain an unresolved promise.
      pending.current?.resolve();
      pending.current = null;
    };
  }, [complete]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [active]);

  const showWelcome = useCallback(() => {
    // Duplicate successful-login callbacks share one five-second transition.
    if (pending.current) return pending.current.promise;
    if (!mounted.current) return Promise.resolve();
    if (timer.current !== null) clearTimeout(timer.current);
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    pending.current = { promise, resolve };
    setSequence(value => value + 1);
    setActive(true);
    setTimerStarted(true);
    timer.current = setTimeout(complete, WELCOME_DURATION_MS);
    return promise;
  }, [complete]);

  const value = useMemo(() => ({ active, showWelcome }), [active, showWelcome]);

  return <WelcomeContext.Provider value={value}>
    <div className={active ? styles.contentBlocked : styles.contentReady} inert={active ? true : undefined} aria-hidden={active ? true : undefined}>
      {children}
    </div>
    {active && <div ref={overlay} key={sequence} className={styles.screen} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} data-testid="centerpro-welcome" data-timer-started={timerStarted ? 'true' : 'false'} data-welcome-sequence={sequence === 0 ? 'initial' : 'login'} style={{ '--welcome-duration': `${WELCOME_DURATION_MS}ms` } as React.CSSProperties}>
      <div className={styles.composition}>
        <WelcomeLogo />
        <p className={styles.message}>مرحباً بك موظفنا المميز</p>
      </div>
    </div>}
  </WelcomeContext.Provider>;
}

export function useWelcome() {
  const context = useContext(WelcomeContext);
  if (!context) throw new Error('WelcomeProvider is required');
  return context;
}
