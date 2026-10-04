# Seasons, ranks and dark mode patch

Date: 2026-10-04. Scope: Phase 1 frontend approval Preview.

## Supplied source

`CenterPro_seasons_ranks_darkmode_ui(1).patch` applied cleanly to `3c30bffa9e3384c2d88359ddc3dd1d7f9ce52e8d`. The exact 2,903-line upload is preserved in [patches/seasons-ranks-darkmode-ui.patch](patches/seasons-ranks-darkmode-ui.patch).

SHA-256: `2fdb90dcbd9f2dedd56d896fe25c9c13acf28f36fa65ff118b904106b5b1006b`.

The supplied [season and rank revision](SEASON_RANK_UI_REVISION.md) records the latest requested rules. Existing attendance and payroll calculations remain unchanged.

## Implemented

- Evaluation hierarchy: exams within cycles within seasons. Admin sees live seasonal totals, archives completed cycles and then freezes the season. Seasons remain independent of payroll months.
- Correctors see **قيد التدقيق** for open exams. Exam, cycle, season, home score and rank views publish closed-exam results only; reopening withdraws those results until they close again.
- Seasonal ranks follow all supplied thresholds from Bronze 1 through Grandmaster at 12,000 points. Badges preserve the supplied Hassan Falah vector geometry and use tier-specific light/dark colors. Attendance days, papers per day and exam/cycle counts are informational only.
- Historical seasons and old seasonless cycles can be reviewed independently. A new season or cycle begins with its own totals; archived snapshots stay frozen.
- Explicit test loading now includes **دانيا اياد** as the third auditor, with 18 present days and no absences. The seven-account payroll fixture totals 2,600,000 IQD; no exams or evaluations are seeded.
- **ابقني مسجلاً** restores the chosen preview account on the same device without saving a password. Logout revokes remembered sign-in while preserving the owner's local preview records. Account switching remains available.
- Login appears immediately. Only successful explicit login shows the centered three-second welcome: **اهلاً بيك** / **موظفنا الـ مو عادي**. Refresh, navigation and session restore do not replay it.
- Light is the default. Header/login theme toggles save an explicit choice independently of OS settings. Cards, tables, forms, dialogs, attendance, payroll, reports, ranks and official logo variants support the dark theme. Printed reports keep a white page and dark text.
- The corrector filter opens beside its trigger, flips above when needed, remains inside the viewport and supports keyboard selection, focus return and outside dismissal. Existing automatic-save safeguards remain intact.

## Integration corrections

- Season archiving applies its closing date before taking the snapshot; frozen cycle membership, exam parents and historical contributions cannot be changed indirectly.
- Valid v2/v3 owner data and archived snapshots survive schema extension. Existing seasonless cycles remain accessible instead of being hidden or assigned an invented season.
- Remembered sign-in and the durable data copy use separate keys. Storage errors are isolated, malformed current payloads remain recoverable, and cross-tab updates/logout avoid silently restoring an old remembered session.
- The explicit test-data button preserves the sign-in flow. Account switching uses `/login?switch=1` so remembered-session redirection cannot block it.
- Horizontally scrollable season tables, reports and the permissions matrix support keyboard focus and have accessible names.
- Theme bootstrap applies the saved choice before body paint. Approved logo variants, seasonal layout, contrast and keyboard focus styles were integrated across old and new screens.

## Deployment boundary

No Neon connection, production authentication, database mutations or real QR validation is introduced. No additional Vercel environment variables are required. Backend integration and Production deployment still await explicit UI approval.

## Local verification

- `npm run check`: lint, strict typecheck, all 196 unit/domain tests across seven files and production build passed.
- Initial full browser run exercised 110 scenarios; 102 passed and eight identified keyboard/contrast/label integration issues. After fixing those issues, all 21 affected auditor filter, automatic-save, responsive and light/dark accessibility scenarios passed.
- Responsive evaluation coverage spans 360, 390, 430, 768, 1024, 1366, 1440 and 1920 pixels; authored dark-theme accessibility also passes at 390, 768 and 1366 pixels. No accessibility rules were disabled.
- Supplied patch SHA-256 matches the preserved file. Whitespace checks and repository secret-marker scan passed.

Deployment and exact-commit CI evidence will be recorded after publishing.
