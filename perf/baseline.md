# FastMe baseline — before changes

Commit: 62b4d1a (main). Measured 2026-11-17 in a Linux container.

## Pages — cold load on an emulated slow phone

Pixel 7 viewport, Lighthouse mobile throttling (150 ms RTT, 1.6 Mbps down, 750 kbps up, 4x CPU), cache disabled,
production build (`next start`), local preview adapter with the populated fixture plus one evaluated season.
"Ready" = navigation start until the page heading is visible. Times in ms.

| Page | Ready (ms) | FCP | LCP | CLS | TBT | Transferred | Images | Requests |
|---|---|---|---|---|---|---|---|---|
| /login | 3108 | 1908 | 1908 | 0.061 | 26 | 523 KB | 4 KB | 19 |
| /dashboard | 3661 | 3592 | 3592 | 0.000 | 429 | 617 KB | 4 KB | 41 |
| /employees | 3359 | 3228 | 3228 | 0.000 | 88 | 606 KB | 4 KB | 40 |
| /employees/:id | 6053 | 3208 | 5980 | 0.000 | 65 | 1085 KB | 466 KB | 41 |
| /evaluations/seasons | 3272 | 3096 | 3164 | 0.000 | 60 | 2077 KB | 1463 KB | 46 |
| /payroll | 3327 | 3200 | 3200 | 0.000 | 97 | 617 KB | 4 KB | 43 |
## API — database round trips per request

Real migration on embedded PostgreSQL (PGlite), populated fixture. In production every round trip also pays the
Vercel↔Neon network latency, so the round-trip count is the number that matters; PGlite times exclude network.

| Request | DB round trips | Response | p50 (PGlite, no network) | p95 |
|---|---|---|---|---|
| GET /api/state (full document) | 19 | 408.6 KB | 25 ms | 30.1 ms |
| GET /api/state?revision (poll, unchanged) | 5 | 0.2 KB | 3.2 ms | 5.7 ms |
| GET /api/state (anonymous) | 18 | 0.6 KB | 16.6 ms | 27.7 ms |
Reproduce: `npx vitest run --config perf/vitest.config.ts` and
`npm run build && npx playwright test --config perf/playwright.config.ts`.
