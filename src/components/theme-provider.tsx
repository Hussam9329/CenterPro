'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'centerpro-theme';
const listeners = new Set<() => void>();

function currentTheme(): ThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function serverTheme(): ThemeMode { return 'light'; }

const ThemeContext = createContext<{ theme: ThemeMode; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    // Restricted browser storage must not prevent a local theme change.
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the choice for this page. */ }
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required');
  return context;
}
