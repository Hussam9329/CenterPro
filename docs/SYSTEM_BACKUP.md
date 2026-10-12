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

Full GitHub CI and Production deployment evidence will be recorded after completion. No new environment variables are required.
