import { describe, expect, it } from 'vitest';
import { attributeErrors, errorBreakdown } from '@/lib/evaluations/error-attribution';

const ali = { key: 'CP-0004', name: 'علي' };
const noor = { key: 'CP-0005', name: 'نور' };

describe('errors credited per auditor', () => {
  it('credits added errors to whoever added them', () => {
    const first = attributeErrors(undefined, { correctionErrors: 2, behaviorErrors: 1 }, ali);
    expect(first).toEqual({ 'CP-0004': { name: 'علي', correctionErrors: 2, behaviorErrors: 1 } });
    const second = attributeErrors({ correctionErrors: 2, behaviorErrors: 1, errorsBy: first }, { correctionErrors: 5, behaviorErrors: 1 }, noor);
    expect(second).toEqual({ 'CP-0004': { name: 'علي', correctionErrors: 2, behaviorErrors: 1 }, 'CP-0005': { name: 'نور', correctionErrors: 3, behaviorErrors: 0 } });
  });

  it('takes removals from the remover first, then from the largest count', () => {
    const start = { 'CP-0004': { name: 'علي', correctionErrors: 2, behaviorErrors: 0 }, 'CP-0005': { name: 'نور', correctionErrors: 3, behaviorErrors: 0 } };
    expect(attributeErrors({ correctionErrors: 5, behaviorErrors: 0, errorsBy: start }, { correctionErrors: 4, behaviorErrors: 0 }, noor))
      .toEqual({ 'CP-0004': { name: 'علي', correctionErrors: 2, behaviorErrors: 0 }, 'CP-0005': { name: 'نور', correctionErrors: 2, behaviorErrors: 0 } });
    // Someone with no errors of their own removes two: they come off the largest count.
    expect(attributeErrors({ correctionErrors: 5, behaviorErrors: 0, errorsBy: start }, { correctionErrors: 3, behaviorErrors: 0 }, { key: 'SYSTEM', name: 'مدير النظام' }))
      .toEqual({ 'CP-0004': { name: 'علي', correctionErrors: 2, behaviorErrors: 0 }, 'CP-0005': { name: 'نور', correctionErrors: 1, behaviorErrors: 0 } });
    expect(attributeErrors({ correctionErrors: 5, behaviorErrors: 0, errorsBy: start }, { correctionErrors: null, behaviorErrors: null }, ali)).toBeUndefined();
  });

  it('leaves errors from before tracking uncredited and removes them first', () => {
    // 4 old errors, then Ali adds 1: only the new one is his.
    const tracked = attributeErrors({ correctionErrors: 4, behaviorErrors: 0 }, { correctionErrors: 5, behaviorErrors: 0 }, ali);
    expect(tracked).toEqual({ 'CP-0004': { name: 'علي', correctionErrors: 1, behaviorErrors: 0 } });
    expect(errorBreakdown({ correctionErrors: 5, behaviorErrors: 0, errorsBy: tracked }, () => undefined).unattributed).toEqual({ correctionErrors: 4, behaviorErrors: 0 });
    // Noor removes two old errors: Ali keeps his one.
    expect(attributeErrors({ correctionErrors: 5, behaviorErrors: 0, errorsBy: tracked }, { correctionErrors: 3, behaviorErrors: 0 }, noor)).toEqual(tracked);
  });

  it('lists auditors by most errors with their current names', () => {
    const errorsBy = { a: { name: 'قديم', correctionErrors: 1, behaviorErrors: 0 }, b: { name: 'ب', correctionErrors: 2, behaviorErrors: 1 } };
    const { rows } = errorBreakdown({ correctionErrors: 3, behaviorErrors: 1, errorsBy }, key => key === 'a' ? 'الاسم الجديد' : undefined);
    expect(rows.map(row => row.name)).toEqual(['ب', 'الاسم الجديد']);
  });
});
