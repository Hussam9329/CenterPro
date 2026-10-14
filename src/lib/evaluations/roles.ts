import type { DemoData, Employee } from '../types';

function normalizeArabic(value: string): string {
  return value.trim().replace(/[أإآ]/g, 'ا').replace(/\s+/g, '');
}

export function isCorrectionDepartmentName(name: string): boolean {
  return normalizeArabic(name) === normalizeArabic('التصحيح');
}

export function isAuditDepartmentName(name: string): boolean {
  return normalizeArabic(name) === normalizeArabic('التدقيق');
}

export function isCorrectionEmployee(data: DemoData, employee: Employee): boolean {
  const department = data.departments.find(item => item.id === employee.departmentId);
  return Boolean(employee.active && department && isCorrectionDepartmentName(department.name));
}

export function isAuditEmployee(data: DemoData, employee: Employee): boolean {
  const department = data.departments.find(item => item.id === employee.departmentId);
  return Boolean(employee.active && department && isAuditDepartmentName(department.name));
}

export function getCorrectionEmployees(data: DemoData): Employee[] {
  return data.employees.filter(employee => isCorrectionEmployee(data, employee));
}
