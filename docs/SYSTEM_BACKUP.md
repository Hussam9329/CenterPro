# Complete system backup — October 12, 2026

The owner requested a download button to preserve all records entered into the current browser-local application before a later database migration. This change adds export only; it does not start database integration, replace existing records, or provide an import/reset action.

## Download

Sign in as the system administrator or an active employee-backed **SUPER_ADMIN**, open **الإعدادات**, then choose **تحميل نسخة احتياطية كاملة**. Use the same browser and CenterPro address where the records were entered. Save pending form changes first. The browser downloads `CenterPro-backup-<UTC timestamp>.json`.

The file contains private employee, financial and account-verification information. Keep it privately. Plaintext passwords cannot be recovered and are not included. The existing salted hashes and their verification parameters are included so a future backend can preserve valid credentials without inventing or exposing passwords.

The download uses the current application snapshot, including changes still in memory when browser persistence is full. It does not filter inactive employees, dates, departments or archived records; it never recalculates financial or evaluation snapshots. Export does not change records, credential versions, login state, storage keys or the current storage version.

## File contract

- `format`: `centerpro-system-backup`.
- `formatVersion`: `1`.
- `payload.dataSchemaVersion`: `1`; `payload.storageVersion`: `4`.
- `payload.exportedAt`: ISO timestamp; `payload.source`: original origin and data revision.
- `payload.preferences.theme`: saved/current interface theme.
- `payload.data`: the complete current `DemoData` object, preserving all JSON fields. It contains employees (including embedded photos), departments and salary rules, workdays and exceptions, attendance, deductions, bonuses, payroll months with their frozen results and source snapshots, payments, audit history, evaluation seasons/cycles/exams and their snapshots, individual exam evaluations, and center settings.
- `payload.authentication.credentials`: the complete current system and employee credential store, including usernames where held by the system account, salts, hashes, credential versions and timestamps. Employee usernames/roles remain in `payload.data.employees`.
- `payload.authentication.passwordKdf`: PBKDF2 with SHA-256, 150,000 iterations, 16-byte salts and 32-byte derived keys; salt/hash use base64. Password input is exact UTF-8, with no normalization.
- `integrity`: SHA-256 of the UTF-8 bytes of `JSON.stringify(payload)`; hexadecimal digest. This detects accidental corruption, not forgery by someone able to recompute it.

Active/remembered sessions and unrelated browser storage are excluded. The backup represents saved application records, not unfinished form drafts, old discarded storage, cookies or recovery/session blobs. Downloading this file does not upload anything or synchronize other devices.

`parseSystemBackup` validates the supported envelope, every known record shape, complete credential shape and digest without importing anything. A strict credential read refuses corrupt/inaccessible records instead of silently dropping accounts and claiming a complete backup. Both creation and verification are read-only.

## Later database migration

Use this file as the migration source after the separately approved backend is ready. Verify the file before writing, preserve record identifiers and relationships, and retain archived snapshots exactly. The future importer must also enforce server authorization and business/reference validation; a valid checksum alone is not trust. Preserve the declared password-verification parameters or require an explicit reset; hashing an existing hash as though it were a password will break login. Never restore browser sessions as server sessions.

## Verification and release

- Local `npm run check` passes lint, strict typecheck, **229 unit tests** and optimized production build.
- Unit checks compare all saved data after serialization and parsing, independently verify the checksum and password derivation metadata, and reject damaged files or incomplete credentials without changing storage.
- Four browser scenarios cover actual download, mobile layout, preserved archives/photos, storage-full recovery from live memory, error handling, role permissions and credential revocation during preparation.
- Restored the bundled Chromium after the ephemeral browser binary was cleared. All **4 backup browser scenarios** pass; **19 existing authentication/persistence scenarios** also pass. A selector in the revocation test was scoped to the backup card to avoid the unrelated Next.js route announcer.
- [Mobile verification screenshot](system-backup-mobile.png) uses synthetic test data and shows the actual download control in dark mode at 390px width.

**Full CI passes:** [GitHub Actions run 38283629387](https://github.com/Hussam9329/CenterPro/actions/runs/38283629387) verifies `495417fa3e5a4ba368b61d893a3acdc02b813bc2` on `main`: lint, strict typecheck, **229 unit tests**, optimized production build and **154/154 browser scenarios** (5.4 minutes for browser tests). Final release documentation and backup filename ignores do not change the deployed application manifest.

## Verified Production deployment

- Source on `main`: `495417fa3e5a4ba368b61d893a3acdc02b813bc2` (application implementation in `d96ce8146ae54092ba0ff798ecc65819de2ca536`, followed by the test-selector correction and mobile evidence).
- Vercel deployment: `dpl_3u2KZYHhB6PiQe9ZC19y2hNdep3W`; target **production**, state **READY**, aliases assigned without error.
- Canonical: https://centerpro-sigma.vercel.app/settings
- Immutable deployment: https://centerpro-e7p86ppxt-hussam9329s-projects.vercel.app
- Application manifest: **123 files**, **11,491,385 bytes**, SHA-256 `14ad17ba93fa1c729722ab9b4fa21040582080cde1140001d8c36885b2af46ac`.
- The canonical `/settings` responds HTTP 200 and serves the new download label and `centerpro-system-backup` implementation in its current assets.

The API deployment publishes the exact committed `main` application; the project has no automatic GitHub deployment link. No environment variables or database credentials are added. Generated private backup filenames are ignored by git.
