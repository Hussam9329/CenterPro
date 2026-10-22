import { describe, expect, it } from 'vitest';
import { sumPaperBatches, visiblePaperBatches } from '@/lib/evaluations/paper-batches';

describe('corrected paper batches', () => {
  it('adds the entered numbers', () => {
    expect(sumPaperBatches([20, 15, 10])).toBe(45);
    expect(sumPaperBatches([])).toBe(0);
  });

  it('shows the saved list only while it still matches the scored total', () => {
    expect(visiblePaperBatches(45, [20, 15, 10])).toEqual([20, 15, 10]);
    // An older screen changed the total without the list: show the total itself.
    expect(visiblePaperBatches(50, [20, 15, 10])).toEqual([50]);
    expect(visiblePaperBatches(42, undefined)).toEqual([42]);
    expect(visiblePaperBatches(null, undefined)).toEqual([]);
    expect(visiblePaperBatches(0, undefined)).toEqual([]);
  });
});
