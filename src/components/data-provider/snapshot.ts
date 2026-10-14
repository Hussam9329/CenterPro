import { createInitialData, DEMO_TODAY, DEMO_MONTH } from '@/lib/mock-data';
import { PREVIEW_SYSTEM_USERNAME } from '@/lib/preview-config';
import type { DemoSession } from '@/lib/types';
import type { Snapshot } from './types';

export const serverSnapshot: Snapshot = { backend: 'local', today: DEMO_TODAY, month: DEMO_MONTH, pendingImport: false, qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false, data: createInitialData(), session: null, ready: false, remembered: false, systemConfigured: false, systemUsername: PREVIEW_SYSTEM_USERNAME };

export function sameAccount(left: DemoSession | null, right: DemoSession | null) {
  return Boolean(left && right && left.role === right.role && left.kind === right.kind && left.employeeId === right.employeeId && left.authVersion === right.authVersion);
}
