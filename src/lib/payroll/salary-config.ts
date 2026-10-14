import type { DemoData, Employee, SalaryConfig } from '../types';

function integer(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} يجب أن يكون عدداً صحيحاً غير سالب.`);
}

export function validateSalaryConfig(config: SalaryConfig): void {
  integer(config.dailyRate, 'قيمة اليومية');
  integer(config.unexcusedRate, 'خصم الغياب');
  integer(config.fixedSalary, 'الراتب القطعي');
  integer(config.maximum, 'الحد الأعلى');
  if (config.mode === 'FIXED') return;
  integer(config.extraDaysStart, 'بداية الأيام الإضافية');
  if (!config.tiers.length) throw new Error('أضف قانون راتب واحداً على الأقل.');
  let previousEnd = -1;
  for (const tier of config.tiers) {
    integer(tier.fromDays, 'بداية القانون');
    integer(tier.toDays, 'نهاية القانون');
    integer(tier.amount, 'مبلغ القانون');
    if (tier.fromDays > tier.toDays) throw new Error('بداية القانون يجب ألا تتجاوز نهايته.');
    if (tier.fromDays <= previousEnd) throw new Error('يجب ترتيب قوانين القسم دون تداخل.');
    if (tier.fromDays !== previousEnd + 1) throw new Error('يجب أن تغطي قوانين القسم جميع أعداد الأيام المطلوبة بدءاً من 0 دون فجوات.');
    previousEnd = tier.toDays;
  }
  if (config.extraDaysStart <= previousEnd) throw new Error('الأيام الإضافية يجب أن تبدأ بعد نهاية آخر قانون.');
}

export function calculateTieredSalary(days: number, config: SalaryConfig): number {
  integer(days, 'الأيام المطلوبة');
  validateSalaryConfig(config);
  const tier = config.tiers.find((item) => days >= item.fromDays && days <= item.toDays);
  if (tier) return Math.min(config.maximum, tier.type === 'PER_DAY' ? days * config.dailyRate : tier.amount);
  const finalTier = config.tiers.at(-1);
  if (!finalTier) throw new Error('إعدادات قوانين القسم غير مكتملة.');
  if (days > finalTier.toDays) {
    const base = finalTier.type === 'PER_DAY' ? finalTier.toDays * config.dailyRate : finalTier.amount;
    const extraDays = Math.max(0, days - config.extraDaysStart + 1);
    return Math.min(config.maximum, base + extraDays * config.dailyRate);
  }
  throw new Error('عدد الأيام المطلوبة غير مغطى بقوانين القسم.');
}

export function calculateFixedSalary(days: number, rate: number, fixed: number, partial: boolean): number {
  integer(days, 'الأيام المطلوبة');
  integer(rate, 'قيمة اليومية');
  integer(fixed, 'الراتب القطعي');
  return partial ? Math.min(days * rate, fixed) : fixed;
}

export function getEffectiveSalaryConfig(data: DemoData, employee: Employee): SalaryConfig {
  const department = data.departments.find((item) => item.id === employee.departmentId);
  if (!department) throw new Error('لم يتم العثور على قسم الموظف.');
  const config = structuredClone(department.salary);
  if (employee.fixedOverride) {
    config.mode = 'FIXED';
    config.fixedSalary = employee.fixedSalary;
    config.dailyRate = employee.dailyRateOverride ?? department.salary.dailyRate;
  }
  return config;
}
