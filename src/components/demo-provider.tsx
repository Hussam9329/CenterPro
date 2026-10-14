'use client';

import type { ReactNode } from 'react';
import { LocalDemoProvider } from './data-provider/local-provider';
import { RemoteDemoProvider } from './data-provider/remote-provider';

export { useDemo, useToast } from './data-provider/context';

export function DemoProvider({ children, backend = 'local' }: { children: ReactNode; backend?: 'local' | 'neon' }) {
  // The production branch never initializes, reads, copies, or removes the
  // legacy browser-local stores. They remain available for backup recovery.
  return backend === 'neon' ? <RemoteDemoProvider>{children}</RemoteDemoProvider> : <LocalDemoProvider>{children}</LocalDemoProvider>;
}
