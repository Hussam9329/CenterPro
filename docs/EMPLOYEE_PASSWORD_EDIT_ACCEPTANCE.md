# Employee password editing — October 11, 2026

The owner requested changing employee passwords from the administrator's employee-information edit dialog and uploading the change. Standing authorization selects GitHub `main` and Vercel Production.

## Behavior

- Open an employee, choose **تعديل الملف**, then **حساب الدخول**. The same field is available through the employee-list edit action.
- **كلمة المرور الجديدة** is optional. Leaving it empty preserves the current credential. A new password needs at least six characters and is applied with **حفظ التعديلات**.
- Moving between edit steps preserves the unsaved password in memory; cancelling discards it. Existing passwords are never displayed.
- Existing roles are preserved: ADMIN manages employee accounts; SUPER_ADMIN can also manage administrator accounts. Employee self-service remains read-only.
- Saving a password changes its hash/version and invalidates previous sessions. The audit retains the acting administrator and sanitized password-change flags, including a super-admin changing their own employee-backed account.
- A failed credential write leaves profile and audit records unchanged, permitting a safe retry. Empty-password edits do not increment credential versions.

The shared password-change callback is also used by the existing standalone reset dialog, preserving its actor audit when changing one's own account. Business calculations, approved styling and browser-local storage scope remain unchanged. This is still the browser-local authentication implementation; no Neon integration or new Vercel environment variables are introduced.

## Verification and deployment

- Local `npm run check`: lint, strict typecheck, **214 unit tests** and optimized production build pass.
- Targeted Playwright: **20/20 browser scenarios** pass across employee management, authentication and the four new inline-password cases.
- The new cases cover administrator permissions, changed-password login, own-account session invalidation and actor audit, blank/cancel behavior, and credential-storage failure/retry.
- [Employee edit screenshot](employee-password-edit.png) shows the new field using synthetic automated-test records. It is a local verification capture, not live customer data.

The exact-commit full CI results and Production deployment will be recorded after completion.
