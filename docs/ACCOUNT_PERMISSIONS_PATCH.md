# Account permissions, audit editing and attendance display

This guide describes the October 15, 2026 owner-supplied patch. Its implementation and deployment verification are separate; release evidence must identify the exact tested and deployed commit.

## Assigning employee access

Sign in as SUPER_ADMIN and open **الصلاحيات**, or open an employee's account editor. Select the EMPLOYEE account, enable **عرض** for the required feature, then select only the additional actions it needs. **عرض** alone is read-only. Save with **حفظ الصلاحيات**, or discard the draft with **إلغاء التغييرات**. Turning off view also clears that feature's action grants.

| Feature | Employee route | Delegated scope |
| --- | --- | --- |
| الخصومات (`DEDUCTIONS`) | `/employee/deductions` | Deductions and the minimal employee descriptors needed to manage them |
| المكافآت (`BONUSES`) | `/employee/bonuses` | Bonuses and the minimal employee descriptors needed to manage them |
| التدقيق (`AUDIT_REVIEW`) | `/employee/audit` | The auditor workspace, correction roster and live evaluation results |

Only active EMPLOYEE accounts can use these grants. Missing permissions deny access; neither existing accounts nor employees in a department named **التدقيق** receive automatic grants. Moving departments does not remove an explicit grant. ADMIN cannot assign or change permissions; administrative roles retain their existing role-based access. Saving changed permissions revokes the affected employee's sessions, so they sign in again using the same password.

View/create/edit/delete are independent except that every action requires view. Creating a missing record requires create, changing an existing record requires edit, and deleting it requires delete plus the existing reason and confirmation. Financial delegation does not grant the other financial collection, colleagues' private profiles, attendance, payments, payroll snapshots or owner controls. Personal salary access remains unchanged.

## Evaluation limits

- The correction roster recognizes normalized exact names **التصحيح** and **قسم التصحيح**. This identifies correctors; it grants no audit permission.
- SUPER_ADMIN can enter and edit numeric evaluations directly. Delegated employees need the matching create or edit action. All numeric entry requires an OPEN exam in an OPEN cycle and, when linked, an OPEN season.
- CLOSED exam counts remain locked. SUPER_ADMIN may edit an OPEN or CLOSED exam's name, date and note within an OPEN cycle.
- ADMIN retains exam/cycle/season lifecycle controls without gaining direct count entry or exam-metadata editing. Existing safe-deletion rules remain separate.
- A view-and-delete employee can delete an eligible evaluation without edit permission. Closed exams and archived cycles/seasons retain their deletion and editing locks.
- Correctors without audit-review access receive published CLOSED results only. An explicit audit grant permits live review; it does not change the employee's corrector/rank eligibility.

The scoring, salary, ranking and frozen archive formulas remain unchanged. The server checks canonical permissions and record state for every operation.

## Attendance and rollout

Administrative attendance dates show an Arabic weekday and English month, such as **الخميس — 15 October 2026**. Attendance month headings use English month names. Stored dates and the Baghdad business clock are unchanged.

Permissions are optional fields in existing employee JSONB records. This patch needs **no new environment variables, SQL migration, backup import or account reset**. Preserve existing Production records and assign any desired grants explicitly after release. Follow the quality gates in [README.md](../README.md); do not substitute this guide for test or deployment evidence.
