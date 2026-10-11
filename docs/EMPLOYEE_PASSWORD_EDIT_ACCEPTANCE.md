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

- Full [GitHub Actions run 38159922612](https://github.com/Hussam9329/CenterPro/actions/runs/38159922612) succeeds for `3ffbd8becfd900d54d3384059776bfa7a6261c12` on `main`: lint, typecheck, **214 unit tests**, optimized production build and **150/150 browser scenarios** (6.2 minutes for the browser suite).
- Final README, UI contract and acceptance updates are documentation only. Their deployed application manifest is identical to the verified application commit above.

## Verified Production

- Application source: `3ffbd8becfd900d54d3384059776bfa7a6261c12`, pushed to `main`.
- Vercel deployment: `dpl_7TPtBNxCNHR4EE42mSqu3UTLCmgK`, target **production**, state **READY**, aliases assigned with no alias error.
- Canonical URL: https://centerpro-sigma.vercel.app/login
- Immutable deployment: https://centerpro-msc3ysqv7-hussam9329s-projects.vercel.app
- Committed deployment manifest: **122 files**, **11,472,579 bytes**; SHA-256 `c6c1a0895b50c7acfff2290fe52edeebeb01d33a10e61fefe501a7484b0cca6a`.
- Public `/login` and `/employees` return HTTP 200. The current Production employee-page assets contain both the new password label and the instruction that leaving it blank preserves the current password.

Deployment used the committed `main` source through the Vercel API. This project has no GitHub integration link, so a GitHub push alone is not claimed to publish it. No environment variables are added or changed.
