import { createContext, useContext } from 'react';
import type { DemoContextValue } from './types';

export const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error('DemoProvider is required'); return context; }
export function useToast() { return useDemo().notify; }
