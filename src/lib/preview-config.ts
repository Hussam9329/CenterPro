import type { DemoSession } from './types';

/** Browser-only preview contract. No production credentials or authorization. */
export const PREVIEW_STORAGE_KEY = 'centerpro-ui-preview-v3';
export const PREVIEW_PERSISTENT_STORAGE_KEY = 'centerpro-ui-preview-remembered-v1';
export const PREVIEW_DATA_STORAGE_KEY = 'centerpro-ui-preview-data-v1';
export const PREVIEW_STORAGE_VERSION = 3;
export const PREVIEW_SYSTEM_USERNAME = 'centerpro-owner';
export const PREVIEW_SYSTEM_ADMIN: DemoSession = {
  role: 'SUPER_ADMIN',
  kind: 'SYSTEM',
  name: 'مدير النظام',
};
