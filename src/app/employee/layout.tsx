import { AppShell } from '@/components/app-shell';
export default function EmployeeLayout({ children }: { children: React.ReactNode }) { return <AppShell employee>{children}</AppShell>; }
