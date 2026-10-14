import { assertAuthStoreForBackup, normalizeUsername, type AuthStore } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import { collectionNames } from './collections';

export class DataReferenceError extends Error {
  constructor(public readonly issues: Record<string, number>) {
    super(`Data cannot be imported or saved until these reference/uniqueness issues are corrected: ${Object.entries(issues).map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
    this.name = 'DataReferenceError';
  }
}

/** Counts only: no private names, credentials, photos or audit content in errors. */
export function validateDataReferences(data: DemoData): void {
  const issues: Record<string, number> = {};
  const add = (key: string, count = 1) => { if (count) issues[key] = (issues[key] ?? 0) + count; };
  // This is a response-only, actor-scoped projection. Importing it as an
  // extension field could override canonical evaluation calculations.
  if (Object.hasOwn(data, 'serverEvaluation')) add('data.reservedReadModel');
  const unique = (key: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) { if (!value.trim()) add(`${key}.empty`); else if (seen.has(value)) add(`${key}.duplicate`); seen.add(value); }
  };
  for (const name of collectionNames) {
    unique(`${name}.id`, data[name].map(row => row.id));
    add(`${name}.reservedId`, data[name].filter(row => ['__proto__', 'constructor', 'prototype'].includes(row.id)).length);
  }
  const departmentIds = new Set(data.departments.map(row => row.id));
  const employeeIds = new Set(data.employees.map(row => row.id));
  const workdayIds = new Set(data.workdays.map(row => row.id));
  const seasonIds = new Set(data.evaluationSeasons.map(row => row.id));
  const cycleIds = new Set(data.evaluationCycles.map(row => row.id));
  const examIds = new Set(data.evaluationExams.map(row => row.id));
  unique('employees.username', data.employees.map(row => normalizeUsername(row.username)));
  unique('employees.code', data.employees.map(row => row.code));
  unique('departments.name', data.departments.map(row => row.name.trim()));
  unique('workdays.date', data.workdays.map(row => row.date));
  unique('months.month', data.months.map(row => row.month));
  unique('attendance.employeeWorkday', data.attendance.map(row => JSON.stringify([row.employeeId, row.workdayId])));
  unique('examEvaluations.examEmployee', data.examEvaluations.map(row => JSON.stringify([row.examId, row.employeeId])));
  add('workdays.multipleOpen', Math.max(0, data.workdays.filter(row => row.state === 'OPEN').length - 1));
  for (const row of data.employees) { if (!departmentIds.has(row.departmentId)) add('employees.departmentMissing'); if (['SYSTEM', 'QR_DISPLAY'].includes(row.id)) add('employees.reservedId'); }
  for (const row of data.workdays) {
    add('workdays.duplicateDepartment', row.departmentIds.length - new Set(row.departmentIds).size);
    for (const id of row.departmentIds) if (!departmentIds.has(id)) add('workdays.departmentMissing');
    for (const id of Object.keys(row.overrides)) if (!employeeIds.has(id)) add('workdays.overrideEmployeeMissing');
  }
  for (const name of ['attendance', 'deductions', 'bonuses', 'payments', 'examEvaluations'] as const) {
    for (const row of data[name]) if (!employeeIds.has(row.employeeId)) add(`${name}.employeeMissing`);
  }
  for (const row of data.attendance) if (!workdayIds.has(row.workdayId)) add('attendance.workdayMissing');
  for (const row of data.evaluationCycles) if (row.seasonId && !seasonIds.has(row.seasonId)) add('evaluationCycles.seasonMissing');
  for (const row of data.evaluationExams) if (!cycleIds.has(row.cycleId)) add('evaluationExams.cycleMissing');
  for (const row of data.examEvaluations) if (!examIds.has(row.examId)) add('examEvaluations.examMissing');
  if (Object.keys(issues).length) throw new DataReferenceError(issues);
}

export function validateAuthReferences(data: DemoData, auth: AuthStore, requireOwner = true): void {
  assertAuthStoreForBackup(auth);
  const issues: Record<string, number> = {};
  const employees = new Set(data.employees.map(employee => employee.id));
  const orphans = Object.keys(auth.employees).filter(id => !employees.has(id)).length;
  if (orphans) issues['credentials.employeeMissing'] = orphans;
  if (requireOwner && !auth.system) issues['credentials.systemOwnerMissing'] = 1;
  if (auth.system && data.employees.some(row => normalizeUsername(row.username) === normalizeUsername(auth.system!.username))) issues['credentials.ownerUsernameCollision'] = 1;
  if (auth.qrDisplay) {
    const qrName = normalizeUsername(auth.qrDisplay.username);
    if (auth.system && qrName === normalizeUsername(auth.system.username)) issues['credentials.qrDisplayOwnerUsernameCollision'] = 1;
    if (data.employees.some(row => qrName === normalizeUsername(row.username))) issues['credentials.qrDisplayEmployeeUsernameCollision'] = 1;
  }
  if (Object.keys(issues).length) throw new DataReferenceError(issues);
}
