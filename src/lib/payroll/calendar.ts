import type { Employee } from '../types';

export function monthBounds(month: string): { first: string; last: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('الشهر غير صالح.');
  const [year, monthNumber] = month.split('-').map(Number);
  return { first: `${month}-01`, last: `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}` };
}

export function isPartialEmploymentMonth(employee: Employee, month: string): boolean {
  const { first, last } = monthBounds(month);
  return (employee.startDate > first && employee.startDate <= last) || Boolean(employee.endDate && employee.endDate >= first && employee.endDate < last);
}
