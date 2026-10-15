'use client';
import { useDemo } from '@/components/demo-provider';
import { AdjustmentsPage } from '@/components/finance/adjustments-page';
import { EmptyState } from '@/components/ui';
import { hasSessionAccountPermission } from '@/lib/permissions';
export default function EmployeeBonusesPage() {
  const { data, session } = useDemo();
  if (!hasSessionAccountPermission(data, session, 'BONUSES', 'view')) return <EmptyState title="لا تملك صلاحية عرض المكافآت" />;
  return <AdjustmentsPage kind="bonuses" />;
}
