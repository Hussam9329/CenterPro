# Shared frontend contract

Use types in `src/lib/types.ts`. Root owns globals.css, layouts, navigation, `components/ui.tsx`, `components/demo-provider.tsx`, `lib/format.ts`.

`useDemo()` from `@/components/demo-provider`: `{ data, session, ready, login(role: Role), logout(), resetDemo(), updateData(updater: (draft: DemoData) => void, audit?: AuditInput) }`. Updater receives a cloned draft; mutate it directly. State is fictional and browser-only. Passwords never go into state. Session available after ready. `useToast()` from same provider returns `(message: string) => void`.

Shared UI from `@/components/ui`: `Button` (variant primary|secondary|ghost|danger, loading, normal button props); `Badge` (tone neutral|brand|success|warning|danger); `PageHeader` (eyebrow?, title, description?, actions?); `Card` (title?, description?, action?, children, className?); `StatCard` (label,value,hint?,icon?,accent?); `Field` (label, children, hint?, error?, required?); `Input`, `Select`, `Textarea` native props; `Dialog` (open,onClose,title,description?,children,wide?); `ConfirmDialog` (open,onClose,onConfirm,title,description,confirmLabel?,danger?); `EmptyState` (title,description?,action?); `Avatar` (name,src?,size?); `SearchInput` (value,onChange,placeholder?); `Pagination` (page,total,pageSize,onChange); `Skeleton` (className?); `Tabs` (items: {value,label}[],value,onChange).

Common classes: page-stack, grid-2, grid-3, stats-grid, form-grid, form-section, form-actions, field-span-2, toolbar, filter-row, data-table, table-wrap, mobile-cards, desktop-table, list-row, muted, amount, text-brand, text-danger, inline, stack, notice, notice-warning, detail-grid, detail-item, button-link.

`lib/format`: money(number) → Latin digit IQD string; number(number); date(string); time(string); monthLabel('2026-09'); duration(seconds). `DEMO_TODAY='2026-09-28'`, `DEMO_MONTH='2026-09'` exported from `lib/mock-data`.

`lib/payroll`: getEmployeePayroll(data, employeeId, month), getMonthPayroll(data,month), calculateTieredSalary(days,config), calculateFixedSalary(days,rate,fixed,partial). `lib/attendance`: isExpected(employee,workday), getLatenessSeconds(checkInISO,date,startTime), statusLabel(status). Keep UI calculations in these services.

Routes admin group: /dashboard, /employees, /employees/[id], /departments, /workdays, /attendance, /payroll, /deductions, /bonuses, /reports, /audit, /settings. Employee: /employee, /employee/attendance, /employee/salary, /employee/profile, /employee/scan. /attendance-display standalone. Root owns layouts, dashboard, login, settings, audit. Page modules own their route files and own components, no changes to shared CSS except optional namespaced CSS module.

Role boundaries in preview: employee only employee routes. Admin cannot manage department salary, roles, admin accounts, audit or settings, or reopen archived months. All permissions simulated; clearly identify preview globally.

Use lucide-react icons, no emoji. URLs and dates Latin digits, Arabic interface. Do not hardcode extra departments or business rules. Realistic mock data, no actual personal or secret information. Mutations show toast feedback and update linked views. Strong confirmation for deactivation, removing attendance, deleting adjustments, salary configuration, archive/reopen. Password reset simple form with no confirmation.
