# CenterPro maintainability refactor

## Scope and release gate

Baseline: `4ee5ef8c5761ec5d89846febc736741d26adf8f6` (attendance quick review).
Working branch: `refactor/centerpro-maintainability`.

The owner requested a complete local refactor, with approval **after implementation and validation and before any upload**. This work must not be pushed to GitHub or deployed to Vercel until that approval. Previous release instructions do not authorize publishing this refactor. Production continues running the existing release while this branch is prepared.

Approval was subsequently received on October 15, 2026 at 03:24 Asia/Baghdad, after the owner reviewed the implementation and validation report: “تمام ارفع”. The approved release is to `main` and Vercel Production. This authorization does not add database migrations, imports or other feature changes; publication remains gated on successful exact-commit CI and deployment verification.

This is a structural refactor of the current application. The approved UI, business rules, routes, API payloads, storage formats and SQL schema remain unchanged. There are no dependency upgrades, migrations, new environment variables, data imports or production data operations.

## Module boundaries

| Area | Stable entry point | Implementation responsibilities |
| --- | --- | --- |
| Client data | `src/components/demo-provider.tsx` | `data-provider/` separates context, local singleton storage, remote HTTP, snapshot lifecycle, draft conflicts and toasts. |
| Server mutations | `src/server/domain.ts` | `domain/` separates schemas, shared guards, employees/settings, attendance/QR, payroll, evaluations, deletion and audit derivation. The coordinator preserves validation order. |
| Authentication | `src/server/auth.ts` | `auth/` separates cookies/sessions, login throttling, locked state transactions and request metadata. |
| Persistence | `src/server/db/repository.ts` | Collection ordering, data writes, credentials and reference validation have separate modules with the same transaction and SQL ordering. |
| Payroll | `src/lib/payroll.ts` | `payroll/` separates salary configuration, calendar rules, calculation and frozen history. Pure `lib/finance/` contains month sources, payment status and report models. |
| Evaluations | `src/lib/evaluations.ts` | `evaluations/` separates role checks, selectors, scoring, ranks, leaderboards, snapshots and state/mutation invariants. |
| Feature interfaces | Existing App Router routes | Components own presentation; focused hooks own attendance review, QR lifecycle, evaluation autosave, employee form drafts and settings drafts. Finance routes compose dedicated records and dialogs. |
| Shared interface | `src/components/ui.tsx`, `app-shell.tsx` | UI primitives are grouped by responsibility. Shell navigation and redirect decisions are centralized separately from presentation. |
| Styling | `src/app/globals.css` | Ordered `src/styles/` imports preserve the original cascade; existing CSS Modules remain at their original paths. |

Existing imports remain valid through the entry points above. Server code depends on pure `lib/` modules, never on React feature components. New feature logic should follow these boundaries rather than extend the facades.

The local authentication store, backup serializer, deletion planner, response projections, photo handling, HTTP/QR cryptography, small route handlers and deployment/database scripts were reviewed and retained where their responsibilities were already cohesive. The refactor does not normalize JSONB history, replace the global revision lock or redesign authentication.

## Behavior that must remain stable

- SQL transaction locks, revision conflict checks, role permissions, projected private data and credential/session revocation.
- Singleton local storage identity and server-rendered snapshot identity. Pending login/logout/save operations and background refresh must not overwrite a newer session or unsaved form.
- Separate Settings form drafts; saving or discarding one must not clear the other's conflict state.
- A single persistent attendance review dialog, including confirmation and failed saves. Quick PRESENT uses the workday start time; absence/exemption opens an unsaved draft. Newly created workdays default to `15:00:00`.
- Required-day salary calculations, rounding, negative balances, immutable payment values, archived sources and explicit recalculation rules.
- Evaluation publication restrictions, null versus zero scores, rank thresholds, frozen archives and identity-bound autosave/retry behavior.
- QR server validation, expiration, clock offset, rotation, camera resource cleanup and duplicate protection.
- Existing RTL markup, accessible names, dialogs, responsive layouts, light/dark styles, rank assets and PWA behavior.

## Local validation procedure

Use Node.js 24.x and an isolated checkout without real database or deployment credentials. Run the repository's normal gates; do not import a real backup or run migrations against Production to test a refactor.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
DATABASE_URL=postgresql://test:test@localhost:5432/centerpro_transport_only SESSION_SECRET=transport-tests-only-not-a-production-secret npm run build
npm run test:e2e:remote
```

The first browser suite requires a build without `DATABASE_URL`; the second requires the synthetic server-mode build shown above. Do not rebuild `.next` while either suite uses it. PostgreSQL integration tests use PGlite with the checked-in migrations; remote browser tests mock HTTP. Neither uses Neon.

In addition to the full gates, compare the current branch to the baseline with synthetic domain inputs and representative desktop/tablet/mobile screens. Preserve stylesheet rule order and public exports when moving code. Final results and any limitations are recorded in `REFACTOR_ACCEPTANCE.md` after verification, not inferred from previous release counts.

After approval, the separate release step can push the reviewed commits to `main`, confirm CI for that exact commit and deploy the existing Vercel Production project. No database migration or new environment variable is required for this refactor.
