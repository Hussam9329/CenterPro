# Cleanup and dark welcome patch — October 11, 2026

## Supplied patch

The owner supplied `CenterPro_production_cleanup_dark_welcome_fix(1).patch` and requested the complete project on `main`. The exact attachment is archived at [patches/production-cleanup-dark-welcome.patch](patches/production-cleanup-dark-welcome.patch).

SHA-256: `bcb7b8b5e2ce07a1cd3fd84b19ec37dfedb4464fc1cd02bf9a09e3e6a0183b1d`.

All 12 file changes applied without conflicts. Additional changes only align regression tests and documentation with the supplied behavior.

## Delivered behavior

- The login fixture loader and its provider API are removed. A clean installation lists only the independent system administrator; operational collections begin empty.
- Browser state moves to version 4. Historical session keys v1/v2/v3 and remembered/data v1 keys are deleted on initialization instead of restoring older preview data, as expressly required by the patch. Newly created version-4 records remain intact on reload and through the supported remembered-session lifecycle.
- The preview strip is removed, metadata uses the application name, and Settings uses the requested system/reset wording. Reset retains its typed confirmation and clears all operational collections.
- The root layout no longer substitutes a holding screen when `VERCEL_ENV=production`. This is a rendering change only.
- The three-second login welcome always has a white background, the approved colored `/brand/logo.svg`, and dark text. The application retains its saved light/dark choice after the welcome and reload. Reduced-motion timing is unchanged.
- The account-switch regression test now uses the visible logout/login flow. Existing tests additionally verify new records survive reload and dark mode returns after the welcome.

## Verification

Local lint, strict typecheck, all 196 unit/domain tests and production build pass. The full browser suite and release verification are recorded below after completion.

## Scope and environment

This remains the current frontend-only build with browser-local state, name-based simulated login and simulated QR validation. The patch does not authorize or implement the deferred Neon/authentication/backend phase. No Neon connection or database mutation was made. Payroll, attendance and evaluation formulas and the approved rank artwork are unchanged.

No environment variables are required for this revision. GitHub/Vercel credentials are used outside the repository for release actions only; none are included in the application or patch archive.
