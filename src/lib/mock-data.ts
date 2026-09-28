import type { DemoData } from './types';

export const DEMO_TODAY = '2026-09-28';
export const DEMO_MONTH = '2026-09';

/** A clean installation. Populated scenarios belong exclusively to tests/fixtures. */
export function createInitialData(): DemoData {
  return {
    employees: [],
    departments: [],
    workdays: [],
    attendance: [],
    deductions: [],
    bonuses: [],
    months: [],
    payments: [],
    audit: [],
    settings: { centerName: 'CenterPro', qrInterval: 45 },
  };
}
