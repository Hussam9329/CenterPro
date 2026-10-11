# Username/password patch — October 11, 2026

## Request and scope

The owner supplied `CenterPro_username_password_login (1).patch` and requested applying and uploading it. The earlier explicit instruction selects GitHub `main` and Vercel **Production**. The unmodified source patch is archived at [`patches/username-password-login.patch`](patches/username-password-login.patch), SHA-256 `eb93f39fc3fa57a2966cba2cc0da1144cd0abe4d7119e80c43faab5545b0064a`.

This patch replaces account selection with browser-local username/password verification. It does not connect Neon, add server authentication, provide cross-device accounts, or make client-side role checks production authorization. These remain deferred Phase 2 work.

## Implemented behavior

- First visit configures the separate SYSTEM administrator with a username, a password of at least six characters, and matching confirmation. It creates no employee, department, attendance, payroll, or fixture records.
- Subsequent explicit logins check an active account and its password. Usernames are trimmed and case-insensitive; passwords are exact. Successful entry retains the approved three-second welcome and routes to the account's workspace.
- Credentials use the supplied PBKDF2-SHA256 scheme with 150,000 iterations, random 16-byte salts and 32-byte derived hashes, stored under `centerpro-local-auth-v1`. Plaintext passwords are excluded from business records, audit events and persistent storage.
- Employee creation retains the initial password only in memory across form steps. A failed credential write leaves the draft available to retry and does not create a duplicate or unusable employee. Password reset changes the actual browser-local credential and its version; earlier sessions are invalidated.
- Old sessions lacking a credential version must sign in again; version-4 business data is preserved. Employees created before this patch need an administrator to set their initial password. No default password is introduced.
- Settings reset removes employee credentials and operational records while preserving the configured SYSTEM credential. Logout and the existing remember-me behavior remain available.

## Integration corrections

The supplied patch also needed a TypeScript-compatible Web Crypto salt type and a derived username default instead of a synchronous state-setting effect. Credential reads handle blocked storage and malformed data safely. Setup does not overwrite an existing owner; concurrent password writes merge against current credentials. Async operations recheck account state before committing, so logout, removal or reset cannot be undone by stale verification. Shared confirmation dialogs await asynchronous saves.

The approved layout, logo, themes, rank artwork and business formulas are preserved. Tests use authentic PBKDF2 fixtures exclusively within the test suite.

## Verification and release

`npm run check` passes: lint, strict typecheck, all **214 unit/domain tests** and the optimized Next.js production build. All **146 browser scenarios** pass. The local full run passed 138 initially; seven login-error assertions needed to exclude Next.js's separate route announcer, and one legacy-state test needed to await initialization. All eight corrected cases passed on a targeted rerun. The final exact-commit GitHub workflow independently passed the complete suite in one run.

- Application commit: `9357f288eda9b1bdc641b6fd9919ed2ceb218913`.
- Tested and deployed `main` commit, including final test corrections: `7debb3399121404c5c42b1c28ab6bf9482697ea0`.
- [GitHub Actions run 38155924585](https://github.com/Hussam9329/CenterPro/actions/runs/38155924585): **success**; lint, typecheck, unit tests, production build and browser tests all passed.
- Vercel deployment: `dpl_F9LQcj7PFKZTToUXHmjBmaJXN5zX`, target **production**, state **READY**. The project identifies this deployment as its current Production release; aliases are assigned with no alias error.
- Primary URL: [https://centerpro-sigma.vercel.app/login](https://centerpro-sigma.vercel.app/login).
- Artifact URL: `https://centerpro-8u3v298mb-hussam9329s-projects.vercel.app`.
- Deployment input: 122 committed application/build files, 11,471,664 bytes; manifest SHA-256 `86bf69659ff6cd4db8a75792599559b790a3fdc8db7ce34a5958c9f676268525`. Test fixtures, docs, environment files and repository credentials are excluded.

Live browser verification on the primary Production URL confirmed the initial administrator setup heading, username/password/confirmation fields, enabled setup action and no account selector. No owner credential was created during this deployment check. The owner chooses their own username and password on first visit. The approved branding and RTL layout are visible in the [Production screenshot](username-password-production.jpg).

No new Vercel environment variables are required. This release was uploaded directly from the immutable `main` commit to the existing Vercel project; it does not establish automatic GitHub-to-Vercel deployment integration.
