import { useRef, useState } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useTheme } from '@/components/theme-provider';
import { serializeSystemBackup, systemBackupFilename } from '@/lib/system-backup';

export function useSystemBackup() {
  const { session, prepareSystemBackup } = useDemo();
  const { theme } = useTheme();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [backupError, setBackupError] = useState('');
  const exportingRef = useRef(false);

  async function downloadBackup() {
    if (exportingRef.current || session?.role !== 'SUPER_ADMIN') return;
    exportingRef.current = true;
    setExporting(true);
    setBackupError('');
    try {
      const backup = await prepareSystemBackup(theme);
      const file = new Blob([serializeSystemBackup(backup)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = systemBackupFilename(backup.payload.exportedAt);
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // Keep the object URL alive while mobile browsers start the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      toast('تم تجهيز النسخة الاحتياطية. تأكد من حفظ الملف على جهازك.');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'تعذر تجهيز النسخة الاحتياطية. حاول مرة أخرى.');
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return { exporting, backupError, downloadBackup };
}
