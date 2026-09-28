# CenterPro — Phase 1

The user's explicit frontend-first approval workflow takes precedence over the master specification's eventual production implementation requirements. Build the final Next.js frontend with mock repositories, then stop at a Vercel **Preview** for UI approval. Do not connect Neon, store real passwords, create production mutations, implement final authentication or real QR validation.

1. Foundation: strict Next.js App Router, Tailwind, branded Arabic RTL design system, types and mock repository, shared navigation, demo role selection.
2. Complete admin and employee workflows: people, departments, workdays, attendance, payroll, adjustments, archive/payment previews, reports, audit and settings.
3. Camera/display UI, PWA, error/empty/loading states and accessible responsive layouts.
4. Lint, typecheck, unit/integration/browser tests, production build and Vercel Preview.

## Authoritative references
- `MASTER_SPECIFICATION.txt`: supplied master prompt, preserved verbatim.
- `PHASE1_REVISION_REQUEST.md`: later authoritative UI revision; empty operational startup, independent system administrator, unified attendance with one OPEN day, revised salary terminology and a five-second welcome. Populated data belongs only in test fixtures.
- CenterPro Visual Identity: crimson #A51C30; white #FFFFFF; support ink #111318; Noto Sans Arabic + Inter. Light only, no gradients or decorative effects.

## Boundary
All preview data is fictional and scoped to the browser. Client role checks are UX simulation only. Production authentication, server authorization, database transactions, object storage, signed QR and financial persistence await explicit UI approval.
