'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import { useTheme } from './theme-provider';
import styles from './welcome.module.css';

export const WELCOME_DURATION_MS = 3000;

interface WelcomeContextValue {
  active: boolean;
  /** Await this only after successful authentication, before navigating to the destination. */
  showWelcome: () => Promise<void>;
}

const WelcomeContext = createContext<WelcomeContextValue | null>(null);

/** Use the approved brand artwork directly so the CP symbol is never clipped or reconstructed differently. */
function WelcomeLogo() {
  const { theme } = useTheme();
  return <Image className={styles.logo} src={theme === 'dark' ? '/brand/logo-white.svg' : '/brand/logo.svg'} width={175} height={51} alt="CenterPro" priority draggable={false} />;
}

export function WelcomeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [sequence, setSequence] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current?.resolve();
    pending.current = null;
  }, []);

  const complete = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setActive(false);
    setTimerStarted(false);
    pending.current?.resolve();
    pending.current = null;
  }, []);

  const showWelcome = useCallback(() => {
    if (pending.current) return pending.current.promise;
    if (timer.current !== null) clearTimeout(timer.current);
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    pending.current = { promise, resolve };
    setSequence(value => value + 1);
    setActive(true);
    setTimerStarted(true);
    requestAnimationFrame(() => overlay.current?.focus({ preventScroll: true }));
    timer.current = setTimeout(complete, WELCOME_DURATION_MS);
    return promise;
  }, [complete]);

  const value = useMemo(() => ({ active, showWelcome }), [active, showWelcome]);

  return <WelcomeContext.Provider value={value}>
    <div className={active ? styles.contentBlocked : styles.contentReady} inert={active ? true : undefined} aria-hidden={active ? true : undefined}>{children}</div>
    {active && <div ref={overlay} key={sequence} className={styles.screen} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1} data-testid="centerpro-welcome" data-timer-started={timerStarted ? 'true' : 'false'} data-welcome-sequence="login" style={{ '--welcome-duration': `${WELCOME_DURATION_MS}ms` } as CSSProperties}>
      <div className={styles.composition}>
        <WelcomeLogo />
        <div className={styles.message}><span>اهلاً بيك</span><strong>موظفنا الـ مو عادي</strong></div>
      </div>
    </div>}
  </WelcomeContext.Provider>;
}

export function useWelcome() {
  const context = useContext(WelcomeContext);
  if (!context) throw new Error('WelcomeProvider is required');
  return context;
}
