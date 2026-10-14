import { useSyncExternalStore, type ReactNode } from 'react';
import { DemoContext } from './context';
import * as store from './local-store';
import { ProviderToast, useProviderToast } from './provider-toast';

export function LocalDemoProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { toast, notify } = useProviderToast();
  function resetDemo() {
    store.resetDemo();
    notify('تم تصفير النظام. يمكنك إنشاء الأقسام والموظفين من البداية.');
  }
  return <DemoContext.Provider value={{
    ...state,
    login: store.login,
    setupSystemAdmin: store.setupSystemAdmin,
    setEmployeePassword: store.setEmployeePassword,
    saveQrDisplayAccount: store.saveQrDisplayAccount,
    prepareSystemBackup: store.prepareSystemBackup,
    logout: store.logout,
    refresh: async () => {},
    discardDraft: () => {},
    resetDemo,
    updateData: store.updateData,
    notify,
  }}>{children}<ProviderToast toast={toast}/></DemoContext.Provider>;
}
