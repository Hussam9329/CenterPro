# Revised Phase 1 UI approval handoff

## Current revision status

Implementation follows the owner-approved [Phase 1 Revision Request](PHASE1_REVISION_REQUEST.md), preserved verbatim. The [original Master Specification](MASTER_SPECIFICATION.txt) remains untouched. The revision overrides its previous populated startup, salary wording, separate workday navigation, open-day assumptions and welcome duration. Other business rules remain in force.

**Application revision:** `229bdcbfef798889256a1d8ff6e5a34a5737fba6`.

**New Preview:** https://centerpro-3rpro5w1c-hussam9329s-projects.vercel.app/login

Vercel deployment `dpl_5QUzB1D6jCtsZeGaZpiovj1XPocj` is READY with Preview target (`target: null`). It was created from committed application files without creating a Production deployment. The complete local gate suite and GitHub quality workflow passed. Historical evidence remains separate.

This remains the frontend approval phase inside the final Next.js repository. Sessions, permissions, attendance and financial changes are browser-only simulations. No Neon, Drizzle migration, production authentication, server persistence or secure signed QR is included.

## Revised review checklist

| Area | Required revised behavior |
| --- | --- |
| Fresh installation | Zero departments, employees, attendance days/records, adjustments, archives, payments and audit events |
| Preview administrator | Separate system Super Admin; no employee ID, department, payroll or attendance membership |
| Other preview roles | Available only for manually created active accounts; never fabricated |
| Storage/reset | v2 key/version; old v1 records do not return; reset restores empty state |
| Setup | Add a department, then employees, then an attendance day |
| Salary wording | Type values only قطعي / غير قطعي; label نوع الراتب; قوانين القسم / إضافة قانون / القانون 1 |
| Attendance navigation | One الحضور entry; hub at `/attendance`, details at `/attendance/[id]` |
| Open-day invariant | At most one OPEN day system-wide; open/reopen blocked when another is open |
| Day close | Unresolved employees block closing, with a link to that day's review |
| Legacy route | `/workdays` redirects safely to unified attendance |
| Attendance display | Uses the single current open day; clear no-open-day state |
| Welcome | Five seconds on full load and successful login; exact message مرحباً بك موظفنا المميز |
| Internal navigation | No welcome replay; reduced motion retains the five-second welcome |
| Financial integrity | Existing formulas, negative balances, archive isolation, explicit recalculation and payment review preserved |
| Empty finance | No broken employee selectors, fake metrics or automatically created archive records |
| Test data | Populated scenarios isolated in test fixtures; never part of default preview |

## Verification status for this revision

| Gate | Status |
| --- | --- |
| ESLint | Passed |
| Strict TypeScript and route types | Passed |
| Domain tests, including clean startup and one-open-day rules | 101 passed across 5 files |
| Production build | Passed; 23 generated pages plus dynamic day and employee routes |
| Browser workflows and clean-state onboarding | 68 passed on the final application commit |
| Responsive and accessibility checks | Eight sizes passed; tested pages have zero axe WCAG A/AA violations |
| Excel and actual PDF checks | Passed; structured cell types and actual A4 PDF verified |
| Welcome timing, reduced motion and full-load/login/navigation lifecycle | Passed; visible through 4999ms and removed at 5000ms |
| PWA/offline behavior | Passed |
| Secret-marker scan | Passed |
| Git commit and new Vercel Preview | Pushed to main and preview/ui-approval; Preview READY |

Responsive targets: 360×800, 390×844, 430×932, 768×1024, 1024×1366, 1366×768, 1440×900 and 1920×1080. Automated viewport checks do not claim physical-device testing. The new Preview must still be reviewed on real phones/tablets.

GitHub verification for the deployed application completed successfully (all gates): https://github.com/Hussam9329/CenterPro/actions/runs/36434469830

## Live Preview verification

The published URL was opened in a separate cloud browser. Initial welcome, login, disabled uncreated roles, post-login welcome and the empty system-admin dashboard were verified. The official identity and guided setup are visible in [the deployed dashboard screenshot](preview-dashboard.jpg). No operational records were created during this smoke check.

## Owner review flow

1. Open the new Preview once its URL is provided. The first five-second welcome leads to login.
2. Enter as **المدير العام** without a real password. A second intentional five-second welcome precedes the dashboard.
3. Confirm all operational statistics start at zero and the system administrator is absent from employee lists.
4. Create a department with **قطعي** or **غير قطعي** salary and its **قوانين القسم**.
5. Create employees within the department, then open a day through **الحضور**.
6. Review that day's employees, seconds-precision check-ins, absence decisions and individual inclusions/exclusions from its detail page.
7. Try to open/reopen another day while one is open; confirm it is blocked with access to the open day. Resolve outstanding cases before closing.
8. Review payroll, adjustments, archives and reports using the manually created test data.
9. Switch to an active account only after creating it, and confirm employees see their own information.
10. For a reopened archived month, attendance/day edits remain pending until explicit payroll recalculation updates the financial snapshot and report source together using historical rules.
11. Refresh to verify the welcome replays; use internal links to verify it does not. Settings reset should return all operational collections to zero.

Changes persist only in the current tab's v2 session. A fresh browser context also starts empty. Financial edge cases used for automated regression checks are not seeded into the owner-facing preview.

## Historical evidence — earlier delivery only

These identifiers and results document the previous populated preview. They are not the current revision's URL, commit or acceptance evidence.

- Previous Preview: https://centerpro-lm2dg7nj5-hussam9329s-projects.vercel.app/login
- Previous application commit: `e35659fe91ba81c4d6b44963bed3ad6cbad893c0`
- Preview branch: `preview/ui-approval`
- Previous passing CI: https://github.com/Hussam9329/CenterPro/actions/runs/36420193405
- Previous Vercel deployment: `dpl_9GkmMgMvPSbEuai8vdbJGxvSfH1C`, READY, Preview (`target: null`).

Earlier evidence recorded ESLint/typecheck/build success, 89 domain tests, 28 browser tests, eight responsive sizes, structured Excel cells and a visually reviewed one-page A4 landscape payroll PDF with 14 test employees. PWA/offline and public browser smoke checks were also performed for that earlier commit. Those populated scenarios now belong only in test fixtures.

## Phase boundary and environment

No Vercel environment variables are required for Phase 1. Use Vercel **Preview**, not Production; production-target builds retain the holding page.

Wait for explicit owner UI/UX approval after the revised Preview is delivered. Do not add Neon/Drizzle, real credentials or sessions, production authorization, real attendance/payment persistence, secure QR validation or a Production deployment. The approved frontend design must remain intact during later backend integration.
