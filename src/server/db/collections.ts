/** Parent-first collection order is also the persistence order. Deletions use
 * its reverse so children are removed before parents in the same transaction. */
export const collectionNames = ['departments', 'employees', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const;
export type CollectionName = typeof collectionNames[number];
export const descriptors: Record<CollectionName, { table: string; columns: Record<string, string> }> = {
  departments: { table: 'departments', columns: {} },
  employees: { table: 'employees', columns: { department_id: 'departmentId', username: 'username', code: 'code' } },
  workdays: { table: 'workdays', columns: { date: 'date', status: 'state' } },
  attendance: { table: 'attendance', columns: { employee_id: 'employeeId', workday_id: 'workdayId' } },
  deductions: { table: 'deductions', columns: { employee_id: 'employeeId', date: 'date' } },
  bonuses: { table: 'bonuses', columns: { employee_id: 'employeeId', date: 'date' } },
  months: { table: 'months', columns: { month: 'month', status: 'state' } },
  payments: { table: 'payments', columns: { employee_id: 'employeeId', month: 'month' } },
  audit: { table: 'audit', columns: { employee_id: 'employeeId', timestamp: 'timestamp' } },
  evaluationSeasons: { table: 'evaluation_seasons', columns: {} },
  evaluationCycles: { table: 'evaluation_cycles', columns: { season_id: 'seasonId' } },
  evaluationExams: { table: 'evaluation_exams', columns: { cycle_id: 'cycleId' } },
  examEvaluations: { table: 'exam_evaluations', columns: { exam_id: 'examId', employee_id: 'employeeId' } },
};
