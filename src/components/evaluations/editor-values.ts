import type { DemoSession } from '@/lib/types';

export type NumericField = 'papers' | 'correctionErrors' | 'behaviorErrors';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PendingValues = Partial<Record<NumericField, string>> & { paperBatches?: number[] };
export const numericFields: NumericField[] = ['papers', 'correctionErrors', 'behaviorErrors'];

export function safeNumber(value: string): number | null {
  if (value === '') return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

export function valueText(value: number | null | undefined): string { return value === null || value === undefined ? '' : String(value); }
export function actorKey(session: DemoSession | null): string { return session ? `${session.kind}:${session.role}:${session.employeeId ?? 'SYSTEM'}` : ''; }
