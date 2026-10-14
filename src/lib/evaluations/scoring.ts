export function calculateEvaluationScore(papers: number | null | undefined, correctionErrors: number | null | undefined, behaviorErrors: number | null | undefined): number {
  return (papers ?? 0) - ((correctionErrors ?? 0) * 5) - ((behaviorErrors ?? 0) * 3);
}

export function calculateAccuracy(papers: number, correctionErrors: number, behaviorErrors: number): number | null {
  if (papers <= 0) return null;
  const raw = 100 - (((correctionErrors + behaviorErrors) / papers) * 100);
  return Math.max(0, Math.min(100, raw));
}

export function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} / 100`;
}

export function formatAveragePapers(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value >= 100 ? 0 : 1)} ورقة/يوم`;
}
