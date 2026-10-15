# Neon backend integration and data migration

## Authorization and current status

On October 12, 2026, the owner confirmed that a complete browser backup had been downloaded and explicitly requested connecting the supplied Neon database. The owner subsequently supplied the JSON and it was imported successfully that day. The existing approved design and later business-rule amendments remain authoritative.

This implementation adds the server boundary and durable storage required for shared accounts/data. The existing Production installation has its imported accounts and records; the private backup is not stored in this repository. A new empty installation remains locked while awaiting its backup. There is no public first-visitor owner setup endpoint. Subsequent releases must preserve existing data and must not repeat the original import.

Implementation and release verification are separate. The final exact source commit, CI run, deployment ID and Production checks are to be recorded after they finish. Do not use a historical phase-one test count or deployment URL as evidence for this release.

## Environment

| Variable | Required use |
| --- | --- |
| `DATABASE_URL` | Neon pooled PostgreSQL URL, TLS enabled; server only |
| `SESSION_SECRET` | At least 32 cryptographically random bytes, no fallback value |
| `APP_ORIGIN` | Canonical HTTPS origin |
| `APP_TIMEZONE` | `Asia/Baghdad` |
| `BLOB_READ_WRITE_TOKEN` | Token for a private Vercel Blob store for employee photos |

No credential belongs in a client bundle, Git history, test artifact, screenshot or log. `.env.example` contains names and instructions only. Shell/CI secrets must be injected through the environment. Build and lint do not perform live database migrations or seeds.

The Production environment variables and private Blob store were configured for the October 12 rollout; the backup import status is recorded above. Each later deployment still requires its own verification. The private store's application object prefix is `centerpro/photos/`; its objects contain the exact original photo data URL, keyed by SHA-256 and served only through the authenticated photo route. No store token or private object URL is recorded here.

The October 15 account-permissions patch stores optional grants in the existing employee JSONB records. It adds no environment variables or SQL migration and must not trigger a backup re-import, account reset or automatic permission grant. See [ACCOUNT_PERMISSIONS_PATCH.md](ACCOUNT_PERMISSIONS_PATCH.md).

Vercel selects server mode even when configuration is absent. Missing configuration fails closed rather than making each visitor an independent browser administrator. Local development without `DATABASE_URL` retains a separate adapter for frontend regression tests. Supplying `DATABASE_URL` selects the real server adapter.

## Persistence and concurrency

`drizzle/0001_centerpro.sql` creates the private `centerpro` schema. Each of the 13 business collections has its own table: departments, employees, workdays, attendance, deductions, bonuses, months, payments, audit, evaluation seasons, evaluation cycles, evaluation exams and exam evaluations. Settings and a global revision occupy a singleton state record. Separate tables store password credentials, hashed session tokens, login throttles and completed import manifests.

Records use JSONB to preserve the current application contract, imported extension fields and frozen historical snapshots. Projected relational columns have foreign keys/indexes and uniqueness constraints for the relationships used by the application. This does not fully normalize nested salary tiers, payroll snapshots or evaluation leaderboard snapshots.

Every mutation locks the singleton revision inside one database transaction, compares the client revision with the current revision and validates against canonical server data. Stale clients receive a conflict instead of replacing someone else's saved work. A mutation is expressed as collection-level record upserts/removals, never as replacement of the whole database. The server only accepts supported operation groups and fields.

The server independently computes workday attendance synchronization, lateness, archived/recalculated payroll, cycle/season snapshots, payment-time salary values and audit metadata. Snapshot fields are omitted from routine archive request payloads so embedded historical photos cannot expand those requests. Employee codes remain unique and monotonically generated inside the serialized write boundary. Record removal uses the explicit, reasoned safe-deletion flow with server permission, relationship and archive checks.

Database constraints enforce unique workday dates, one open workday and unique employee/workday attendance. Evaluation-state guards enforce one open cycle/season and immutable archives. Client validation is only a usability aid.

The compatibility adapter currently reads complete authorized collection snapshots and uses a global write revision. It is suitable for the specified single center; it is not an implementation of unlimited-history SQL pagination or independent parallel row editing. Future growth should be measured and addressed with server pagination/aggregations while retaining permission and archive semantics.

## Authentication and authorization

- Usernames are required and compared case-insensitively across the system owner and employee accounts.
- Passwords are salted PBKDF2-SHA-256 records compatible with the existing portable backup: 150,000 iterations, 16-byte salt, 32-byte derived key. No plaintext is persisted or recoverable. Password values never enter domain records, logs or audit payloads.
- Server sessions use cryptographically random 32-byte opaque tokens; only their SHA-256 hashes are stored in PostgreSQL. Production cookies use the `__Host-` prefix, HttpOnly, Secure, SameSite=Strict and `/` path.
- A normal session expires after 8 hours. Remembered sessions expire after 30 days. Logout removes the server session. Password reset increments credential version and invalidates that account's sessions; inactive or role-changed accounts fail current permission checks.
- Changing an employee's per-account permissions revokes that account's sessions in the same transaction as the permission update. The employee signs in again with the existing password; changing permissions does not reset it.
- Login attempts use shared database counters and server-secret HMAC keys. Account and trusted-edge-IP limits operate across serverless instances. Unknown usernames still execute the password KDF. Error responses do not identify which credential was wrong.
- Mutating API requests require same-origin JSON and enforce body size/schema limits. Authenticated responses are private/no-store and are not cached by the PWA worker.

ADMIN may manage employee operations and open payroll, but cannot edit administrator accounts, roles, protected salary configuration, departments, owner settings/audit or reopen historical payroll. SUPER_ADMIN has the protected permissions and exclusively manages employee account permissions, including through employee-profile edits. ADMIN cannot add, change or remove those grants.

An active EMPLOYEE account may receive explicit `DEDUCTIONS`, `BONUSES` and `AUDIT_REVIEW` permissions, each with separate `view`, `create`, `edit` and `delete` actions. Actions require `view`; omitted permissions are denied. Department membership never grants audit access, and moving departments does not remove an explicit grant. Administrative accounts retain their role permissions rather than receiving employee grants.

Without delegated grants, an employee receives their own private and financial records and any applicable published corrector rankings. A deductions or bonuses view grant exposes the selected collection's records plus minimal employee descriptors needed by that screen; it does not grant colleagues' private profiles, attendance, payments, payroll snapshots or the other financial collection. Mutations are authorized separately for the requested action and retain month/archive locks.

Correctors without audit-review access never receive OPEN-exam counts, errors, scores or an indirect unpublished cycle/season total. An explicit audit-review view grant permits the live auditor workspace even when the account is also a corrector. Other employees' descriptors contain name/code/department only, with private profile fields blank. Season totals are computed on the server so the browser does not need colleagues' attendance dates. Nested payroll source snapshots and imported extension fields are filtered as well; hiding a UI element is not the authorization boundary.

## Attendance and QR

The server issues a signed, rotating token containing version, workday ID/fingerprint, issued/expiry timestamps and a random nonce. Lifetime is configurable from 30 to 60 seconds. Changes to workday configuration invalidate the corresponding fingerprint. Tokens contain no employee details.

The check-in handler verifies signature, expiry and current workday before calling the trusted attendance operation. The actor comes from the server session. The workday must be open on the current Baghdad date, the employee active and expected/not exempt, and the payroll month open. The server records its own timestamp and derives lateness to the second. Duplicate scans return the existing check-in rather than create another record. Generic employee mutation requests cannot create attendance rows.

No GPS, network-name or IP-matching condition is added. Camera permission and a secure HTTPS browser remain necessary. Closed/historical workdays remain editable through the authorized administrative flow with the existing month locks and audit rules. No automatic absence assignment, grace period or lateness deduction is introduced.

Administrative attendance dates display the Arabic weekday with a Latin-digit date and English month, for example `الخميس — 15 October 2026`. Month headings use English month names. This is presentation only: stored dates, timestamps and the `Asia/Baghdad` business clock are unchanged.

## Payroll and evaluations

Preserve the later approved required-day rule: PRESENT, EXCUSED, UNEXCUSED and UNRESOLVED required days determine non-fixed salary laws; EXEMPT does not count. Partial first/final fixed months use required days multiplied by the effective daily rate, capped at fixed salary. Deductions and bonuses then apply; final salary may be negative. All money values must remain safe integers.

Open months use current salary configuration. Archiving requires actual payroll rows and no unresolved attendance and creates server-calculated snapshots. SUPER_ADMIN may reopen, but monetary snapshots remain frozen until explicit recalculation using archived salary/employee/department context. Re-archiving is blocked while operational edits remain unapplied. Payments are append-only; historical payment information stays intact when a recalculated salary requires review.

The correction roster recognizes the normalized exact department names `التصحيح` and `قسم التصحيح`; this identifies eligible correction employees only. Audit-review access is an explicit account grant, with no department-name fallback. An active EMPLOYEE with `AUDIT_REVIEW.view` may open the auditor workspace. Creating a missing evaluation requires `create`, updating an existing evaluation requires `edit`, and reasoned deletion requires `delete`; those actions are independent.

SUPER_ADMIN may enter or edit numeric evaluations directly. Employee and owner numeric editing is limited to OPEN exams in an OPEN cycle and, when linked, an OPEN season. CLOSED exam counts remain locked. SUPER_ADMIN may edit an OPEN or CLOSED exam's name, date and note while its cycle is OPEN. ADMIN retains exam/cycle/season lifecycle management without gaining direct count entry or exam-metadata editing. Existing explicit safe-deletion rules remain separate from numeric editing.

Archived cycle/season locks apply to all roles and delegated actions. Cycle archive freezes its complete exam/leaderboard snapshots and closes exams atomically. Season archive requires no open cycle and uses the server Baghdad closing date. The approved score, accuracy, tie-breaking and seasonal rank rules stay unchanged.

## Employee photos

Photo storage uses private Vercel Blob objects referenced through authenticated `/api/photos/<hash>` URLs. Private object URLs/tokens are never exposed as unrestricted public profile assets. The server validates file type, decoded size and image signature before accepting new image data. The existing form keeps its 1 MiB image limit and approved layout.

An ordinary profile edit may retain that employee's existing stored reference; it cannot copy another employee's internal photo URL into a new record. Full backup exports rehydrate photo data into the portable representation so backups remain independent of private object URLs. Imported historical references/images and frozen snapshots must not be silently discarded or repriced.

## Migration procedure

The operator uses an environment already configured with the intended database. Commands are wrappers for `node --import tsx scripts/db-migrate.ts` and `node --import tsx scripts/db-import.ts`.

```sh
npm run db:migrate -- --check
npm run db:migrate
npm run db:import -- /absolute/path/CenterPro-backup.json --dry-run
npm run db:import -- /absolute/path/CenterPro-backup.json
```

1. Keep the downloaded original JSON private and unchanged. Do not put it in `public/`, fixtures, Git or a web-accessible upload directory.
2. Check migration status. The migrator applies the checked-in migration under a transaction/advisory lock, records its SHA-256 digest and rejects checksum drift. Repeating an already applied migration is safe. No employee, department, owner or attendance seed is fabricated.
3. Run `--dry-run`. This parses the versioned backup, verifies its SHA-256 integrity and credential format, validates relationships and current invariants, and reports counts/digest. It makes no database connection and changes nothing.
4. Resolve validation errors explicitly. Do not delete duplicates, invent missing parent records, change usernames, replace passwords or recalculate archives to force an import through.
5. Run the actual import only after reviewing the dry-run summary against the expected backup. The import is empty-installation-only and transactional; it refuses to overwrite existing accounts/data. Repeating the exact already imported digest is a no-op. A different later backup requires a reviewed merge plan, not an automatic destructive replacement.
6. Verify imported collection/credential counts, IDs/codes, photo access, archived totals and representative original-account sign-in. No plaintext password is needed to import hashes, but actual sign-in verification requires the account holder's known password.
7. Verify data saved on one authenticated device becomes visible from another. Keep the original local backup until the imported installation is verified.

The checksum detects accidental corruption; it is not cryptographic proof that an arbitrary file came from the owner. The import is an operator-authorized action, not a public upload API. Browser session and remembered-login objects are excluded. Existing version 4 browser storage remains untouched and is never treated as a valid server session.

## Tests and release evidence

Required commands:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
DATABASE_URL=postgresql://test:test@localhost:5432/centerpro_transport_only SESSION_SECRET=transport-tests-only-not-a-production-secret npm run build
npm run test:e2e:remote
```

The domain suite exercises role bypasses, canonical calculations/audits, archived locks, timestamp authority, credential reset flags, signed QR failure cases, private read projections and conflict handling. Database integration tests apply the actual SQL migration to isolated PGlite PostgreSQL instances and exercise persistence, uniqueness, constraints, import rollback/idempotency and credentials. These tests never connect to the owner's database or use their personnel data.

The existing Playwright suite continues exercising the approved UI through an isolated local adapter. The remote suite verifies asynchronous server transport, conflict/error feedback and session behavior through a server-mode build and controlled responses. It is explicitly not a substitute for Production connectivity checks.

Release evidence remains pending in this document until the root release process records:

- Exact implementation/source commit on `main`.
- Passing lint, typecheck, unit/integration tests, browser suites and optimized build.
- CI URL tied to that commit.
- Production deployment ID, source commit and canonical aliases.
- No-secret checks of unauthenticated health/session responses and the existing installation's readiness against the real Neon connection.
- Owner backup import status: completed October 12, 2026; subsequent releases preserve that installation and do not repeat the import.

This document's historical import status does not certify a later release. Record that release's exact source, tests and deployment verification separately.
