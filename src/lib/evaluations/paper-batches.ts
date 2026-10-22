/** Most numbers one evaluation can list; far above a real exam day. */
export const PAPER_BATCHES_LIMIT = 100;

export function sumPaperBatches(batches: readonly number[]): number {
  return batches.reduce((total, value) => total + value, 0);
}

/**
 * The numbers to show for a saved evaluation. A list that no longer adds up to
 * `papers` (an older screen edited the total, or the record predates the list)
 * is replaced by the total itself, so the chips always match what is scored.
 */
export function visiblePaperBatches(papers: number | null, batches: readonly number[] | undefined): number[] {
  if (batches?.length && sumPaperBatches(batches) === papers) return [...batches];
  return papers ? [papers] : [];
}
