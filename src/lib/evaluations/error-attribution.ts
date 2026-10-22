import type { ErrorContribution, ExamEvaluation } from '../types';

type ErrorField = 'correctionErrors' | 'behaviorErrors';
type Counts = Pick<ExamEvaluation, ErrorField> & { errorsBy?: Record<string, ErrorContribution> };
const fields: ErrorField[] = ['correctionErrors', 'behaviorErrors'];

/** Stable key for whoever is saving: the employee id, or SYSTEM for the owner account. */
export function errorActorKey(actor: { employeeId?: string }): string {
  return actor.employeeId ?? 'SYSTEM';
}

/**
 * Credits each added error to the auditor who added it. Removing errors takes
 * them from the remover's own count first, then from whoever has the most, so
 * the credited counts never exceed the totals. Errors entered before tracking
 * began stay uncredited.
 */
export function attributeErrors(previous: Counts | undefined, next: Pick<ExamEvaluation, ErrorField>, actor: { key: string; name: string }): Record<string, ErrorContribution> | undefined {
  const result: Record<string, ErrorContribution> = Object.fromEntries(Object.entries(previous?.errorsBy ?? {}).map(([key, value]) => [key, { ...value }]));
  for (const field of fields) {
    const before = previous?.[field] ?? 0;
    const after = next[field] ?? 0;
    if (after > before) {
      const own = result[actor.key] ??= { name: actor.name, correctionErrors: 0, behaviorErrors: 0 };
      own[field] += after - before;
    } else if (after < before) {
      const own = result[actor.key];
      if (own) own[field] -= Math.min(own[field], before - after);
      let excess = Object.values(result).reduce((sum, item) => sum + item[field], 0) - after;
      while (excess > 0) {
        const largest = Object.values(result).filter(item => item[field] > 0).sort((a, b) => b[field] - a[field])[0];
        if (!largest) break;
        const taken = Math.min(largest[field], excess);
        largest[field] -= taken;
        excess -= taken;
      }
    }
  }
  if (result[actor.key]) result[actor.key].name = actor.name;
  for (const [key, value] of Object.entries(result)) if (!value.correctionErrors && !value.behaviorErrors) delete result[key];
  return Object.keys(result).length ? result : undefined;
}

export interface ErrorBreakdownRow { key: string; name: string; correctionErrors: number; behaviorErrors: number }

/** Rows for the per-corrector errors dialog, with any uncredited remainder last. */
export function errorBreakdown(evaluation: Counts | undefined, currentName: (key: string) => string | undefined): { rows: ErrorBreakdownRow[]; unattributed: { correctionErrors: number; behaviorErrors: number } } {
  const rows = Object.entries(evaluation?.errorsBy ?? {})
    .map(([key, value]) => ({ key, name: currentName(key) ?? value.name, correctionErrors: value.correctionErrors, behaviorErrors: value.behaviorErrors }))
    .sort((a, b) => (b.correctionErrors + b.behaviorErrors) - (a.correctionErrors + a.behaviorErrors) || a.name.localeCompare(b.name, 'ar'));
  const credited = (field: ErrorField) => rows.reduce((sum, row) => sum + row[field], 0);
  return {
    rows,
    unattributed: {
      correctionErrors: Math.max(0, (evaluation?.correctionErrors ?? 0) - credited('correctionErrors')),
      behaviorErrors: Math.max(0, (evaluation?.behaviorErrors ?? 0) - credited('behaviorErrors')),
    },
  };
}
