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

`npm run check` passes: lint, strict typecheck, all **214 unit/domain tests** and the optimized Next.js production build. Browser validation includes 146 scenarios; the final browser results and Production deployment evidence will be recorded here after they complete. No new Vercel environment variables are required for this browser-local patch.
