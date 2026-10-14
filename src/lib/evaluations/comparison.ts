export function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function assertUniqueIds(items: { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw new Error(`معرّفات ${label} يجب أن تكون فريدة.`);
    ids.add(item.id);
  }
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function sameIds(first: string[], second: string[]): boolean {
  return sameValue([...first].sort(), [...second].sort());
}

export function changedRecords<T extends { id: string }>(before: T[], after: T[]): T[] {
  const previous = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  return [...before.filter(item => !sameValue(item, next.get(item.id))), ...after.filter(item => !sameValue(item, previous.get(item.id)))];
}
