# Season, rank and UI revision — 2026-10-04

This owner-approved Phase 1 addendum overrides older welcome/theme and evaluation-publication presentation rules while preserving existing attendance, payroll and evaluation score business logic.

## Evaluation seasons

- Hierarchy: exam → evaluation cycle → season.
- A season is independent of payroll months and stays open until Admin closes it.
- One season and one cycle may be open at a time; the season cannot archive while a cycle is open.
- Admin seasonal totals are live across all cycles in the season. Archived season snapshots freeze final rows and cycle IDs.
- Score remains `papers − correctionErrors × 5 − behaviorErrors × 3`; exam count, attendance days and average papers/day never affect the score or ordering.
- Season attendance is unique `PRESENT` workday dates within the season. Average papers/day is season papers divided by attendance days, or unavailable at zero days.

## Publishing exam results to correctors

- Admin and auditors can see live data for an open exam.
- A corrector sees `قيد التدقيق` until Admin closes the exam, with no errors, exam score or exam leaderboard exposed.
- Corrector-visible cycle and season totals use closed exams only, preventing indirect disclosure through totals/rank.
- Closing the exam publishes its result immediately to corrector views.

## Seasonal ranks

| Rank | Points |
| --- | ---: |
| Bronze 1 / 2 / 3 | 0 / 500 / 1000 |
| Silver 1 / 2 / 3 | 1500 / 2000 / 2500 |
| Gold 1 / 2 / 3 | 3000 / 3500 / 4000 |
| Platinum 1 / 2 / 3 | 4500 / 5000 / 5500 |
| Diamond 1 / 2 / 3 | 6000 / 6500 / 7000 |
| Emerald 1 / 2 / 3 | 7500 / 8000 / 8500 |
| Master 1 / 2 / 3 | 9000 / 10000 / 11000 |
| Grandmaster | 12000+ |

Rank badges use the approved Hassan Falah logo geometry, recolored per tier without substituting a CenterPro shield. The corrector dashboard shows the seasonal badge, score, place, next-rank progress, cycles/exams, attendance days, average papers/day and accuracy, plus `انت موظف مو عادي !`. The badge uses a restrained shine sweep and respects reduced-motion settings.

## Preview accounts

The explicit test-data loader now creates four correctors and three auditors. The added auditor is **دانيا اياد**, active with 18 present days and no absences. Test data still contains no exams or evaluations.

## Login and welcome

- The login page opens directly; there is no pre-login splash.
- Only an explicit successful login shows the centered three-second CenterPro welcome.
- Exact text: `اهلاً بيك` then `موظفنا الـ مو عادي`.
- Refresh, normal navigation and remembered-session restoration do not replay the welcome.
- `ابقني مسجلاً` persists the preview session on the same device without storing a password; logout clears it.

## Theme and UI

- Light remains the default.
- The header/login exposes a direct Light/Dark toggle; choice is saved locally and does not follow the OS theme automatically.
- Dark mode is authored for cards, tables, forms, dialogs, navigation, evaluation views and rank colors rather than applying inversion.
- Crimson `#A51C30` is used a little more strongly for actions, active navigation, selected states, accents and progress while white/neutral space remains dominant.
- Explanatory developer-style paragraphs are removed from ordinary evaluation/audit screens; prefer concise labels, values and actions.
- The auditor corrector multi-select is anchored to its trigger on mobile/desktop and flips above when there is insufficient space below.
