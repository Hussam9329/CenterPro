import type { DemoSession } from './types';

/**
 * Browser-local application state used by the current frontend-only build.
 *
 * Version 4 intentionally starts from a clean operational dataset.  The key
 * bump prevents old preview/test employees, departments and attendance from
 * being resurrected by a browser that previously opened an older CenterPro
 * build.
 */
export const PREVIEW_STORAGE_KEY = 'centerpro-ui-preview-v4';
export const PREVIEW_PERSISTENT_STORAGE_KEY = 'centerpro-ui-preview-remembered-v2';
export const PREVIEW_DATA_STORAGE_KEY = 'centerpro-ui-preview-data-v2';
export const PREVIEW_STORAGE_VERSION = 4;
export const PREVIEW_SYSTEM_USERNAME = 'centerpro-owner';
export const PREVIEW_SYSTEM_ADMIN: DemoSession = {
  role: 'SUPER_ADMIN',
  kind: 'SYSTEM',
  name: 'مدير النظام',
};
