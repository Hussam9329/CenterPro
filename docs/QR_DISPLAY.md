# Dedicated attendance display account

The October 14, 2026 owner-supplied patch adds one standalone `QR_DISPLAY` account for the center iPad. It is outside employees, attendance and payroll. The owner creates its username/password in **الإعدادات → حساب شاشة الحضور**; no predefined password or automatic account is installed.

## Use

1. Sign in as SUPER_ADMIN and open Settings.
2. Choose a unique username and a password of at least six characters. Save the active account.
3. Sign in with those credentials on the iPad; optionally enable Remember me. It opens `/attendance-display` directly.
4. Open today's workday from a separate administrative session. The iPad refreshes the current day and signed QR automatically.

The account cannot open/close workdays, view personnel or salary data, export backups, edit settings, submit attendance, or use general mutation endpoints. Its server snapshot contains only center display settings and minimal open-day information. Restricted navigation returns it to the display. If no current workday is open, it shows the empty state without administrative controls.

Only SUPER_ADMIN may create, rename, activate/deactivate or change the account password. Leaving the password blank during an edit retains the current password. Saving account changes revokes its existing sessions only; administrator and employee sessions are preserved. Passwords remain salted verification hashes, never plaintext. The complete owner backup includes the optional account credential so it can be restored on an empty installation.

## Deployment

No new environment variable is required. Keep the existing Production environment configuration.

After local quality gates and before activating the new deployment, run:

```sh
npm run db:migrate -- --check
npm run db:migrate
npm run db:migrate -- --check
```

`0002_qr_display_account.sql` replaces the credential-kind constraint to permit the standalone display account. It does not insert accounts, change passwords, remove sessions, import backups or rewrite business records. Migrations are transactional and checksummed; rerunning the migration command is a no-op when current. Do not change the already-applied `0001_centerpro.sql` migration.

## Verification

Run lint, typecheck, unit/integration tests, both frontend browser suites and Production builds as defined in `.github/workflows/quality.yml`. Database tests exercise upgrade preservation, account creation/edit/revocation, permission denials, collisions, privacy projection and backup restoration. Remote browser tests use controlled API fixtures; after deployment separately verify the canonical Production health/state and new route boundaries. No testing account or fabricated business data should be inserted into Production.
