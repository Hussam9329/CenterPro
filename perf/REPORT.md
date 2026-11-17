# FastMe report — CenterPro

Branch `claude/fastme-centerpro`, measured against `main` (62b4d1a) on 2026-11-17.
The method and raw "before" numbers are in [baseline.md](baseline.md).

## How it was measured

- **Pages:** production build (`next start`), emulated Pixel 7 with Lighthouse mobile throttling
  (150 ms RTT, 1.6 Mbps down, 750 kbps up, 4x CPU slowdown), cache disabled, so every page is a cold load
  on a slow phone with a weak connection. The data is the populated test fixture plus one evaluated season, so
  rank badges appear. "Ready" means the time until the page heading is visible.
- **API:** the real routes and SQL migration on embedded PostgreSQL, counting database round trips per request.
  In production each round trip also pays the Vercel↔Neon network delay, which the container cannot measure.
  Neither production site nor Neon is reachable from the measuring container.
- Single runs. Page timings vary by about ±10% between runs. Byte and round-trip counts are exact.

## Results

### Pages: cold load on a slow phone

| Page | Ready before → after | LCP before → after | Transferred before → after | Images before → after |
|---|---|---|---|---|
| Employee profile (`/employees/:id`) | 6082 → **3632 ms (−40%)** | 6020 → **3564 ms (−41%)** | 1085 → **665 KB (−39%)** | 466 → **46 KB (−90%)** |
| Season leaderboard (`/evaluations/seasons`) | 3309 → 3426 ms (±noise) | 11036 → **4188 ms (−62%)** | 2077 → **744 KB (−64%)** | 1463 → **130 KB (−91%)** |
| Login | 3168 → 3133 ms | 1948 → 1940 ms | 523 → 523 KB | — |
| Dashboard | 3322 → 3220 ms | 3144 → 3112 ms | 617 → 617 KB | — |
| Employees | 3252 → 3308 ms | 3156 → 3224 ms | 606 → 606 KB | — |
| Payroll | 3260 → 3369 ms | 3124 → 3276 ms | 617 → 617 KB | — |

CLS stayed 0 on every signed-in page (login 0.061 before and after). Pages without rank artwork were already
lean and did not change, apart from measurement noise.

### API: database round trips per request

| Request | Before | After |
|---|---|---|
| `GET /api/state`, full document (sign-in, refresh, after any change) | 19 | **7 (−63%)** |
| `GET /api/state`, signed-out (login page) | 18 | **4 (−78%)** |
| `GET /api/state?revision`, unchanged poll (every 60 s and on focus) | 5 | 5 |
| Reading the document inside every write (`withState`, `/api/mutations` and others) | 14 | **2** |

A full read saves 12 sequential round trips. That is about 60 ms if the app and database share a region
(~5 ms per trip), and about 1 s if they are in different regions (~80 ms per trip). The response bodies are
byte-for-byte the same size, and the integration tests confirm the data is identical.

## What was changed

| # | Change | Commit |
|---|---|---|
| 8, 9 | Rank artwork served as 512 px WebP instead of 1024 px PNG: 480 KB → 44 KB per badge, 10.5 MB → 1 MB for all 22. Profile badges keep `priority`; leaderboard badges stay lazy. | `106a61c` |
| 28 | Browser caching for `/ranks/*` and `/brand/*` (1 week + stale-while-revalidate). These files were revalidated on every view. | `9d7aa0f` |
| 22, 13 | All collections read in **one** SQL statement (`json_agg` per collection, same ordering) instead of one sequential `SELECT` each. | `e11e67d` |
| 18 | Signed-out `/api/state` no longer reads the whole document only to discard it. | `0c490b7` |
| 31 | OpenTelemetry via `@vercel/otel` (`src/instrumentation.ts`), a `centerpro.db` span around every database transaction, and a log line for database work ≥ 1 s. | `61737d4` |
| 19 | Timeouts on Vercel Blob photo reads and writes (15 s), and on the browser `apiRequest` helper used by QR, check-in and rest calls (30 s). | `7bd9bd5` |
| 1, 2, 33, 34 | Repeatable measurements in `perf/`, plus this report. | `f8ec45c` |

## Already in place (no change needed)

| # | Item | Why it was skipped |
|---|---|---|
| 3 | SSR / static generation | Every page is prerendered as a static shell. The data is private to each account, so the browser fetches it after authentication. |
| 4 | Code splitting | Next.js already splits code per route. The heavy libraries (`exceljs`, `@zxing/browser`) already use dynamic `import()`. |
| 6 | Third-party scripts | The app loads none. |
| 7 | Self-hosted fonts | Fontsource is already self-hosted. One variable font file covers every weight, and `unicode-range` means the browser downloads only the Arabic and Latin subsets. |
| 9 | Lazy images | `next/image` lazy-loads by default. Only the large profile badge uses `priority`. |
| 10 | Skeleton loading | `AppSkeleton` and `Suspense` skeletons are already in place, and CLS is 0. |
| 12 | Deduplicated API calls | One shared snapshot provider. Background polls send the known revision and get a 0.2 KB answer. |
| 15 | Virtualization | Lists are already paginated (8–12 rows per page). |
| 24 | Select only needed columns | Reads select only the `record` column. |
| 27 | CDN | Vercel's edge network serves prerendered pages and `/_next/static` (immutable, 1 year). |
| 26 | Brotli / gzip | Vercel compresses automatically. This could not be checked from the container because the site is blocked there. |

## Not applied, with the reason

| # | Item | Reason |
|---|---|---|
| 11 | Debounce search | Search filters data already in memory and sends no requests. The worst keystroke on the slow phone took 56–80 ms, well below the 200 ms "good" limit for INP. A debounce would only delay the results. |
| 16 | Prevent re-renders | Total blocking time is under 150 ms on every page, and typing is responsive (see above). Profiling showed nothing worth memoizing. |
| 14 | Optimistic UI | Writes to payroll, attendance and permissions are checked against the server revision, and they conflict on purpose if someone else saved first. Showing a change before the server confirms it would show money and attendance figures that may be rejected. |
| 17 | AI streaming | The app has no AI responses. |
| 18 | API pagination | The app's design sends one revisioned, permission-projected document to each account (409 KB uncompressed for the fixture). Unchanged polls are already 0.2 KB. Paging it would mean redesigning the sync model. Revisit only if the data grows a lot. |
| 20 | Background jobs | There is no slow server work. Exports run in the browser and backups are owner-only downloads. |
| 21 | Redis | All data is private and projected per account, and the revision short-circuit already makes polls cheap. A cache would add a network hop and a risk of serving stale data. |
| 23 | New indexes | Foreign-key and lookup indexes already exist. The hot reads are full, ordered scans of small tables (one center), so an index would not help. |
| 30 | Load balancing | Vercel scales functions automatically. One center's traffic does not need more. |

## Recommendations that need your decision

1. **Check that the Vercel function region matches the Neon region** (Vercel → Project → Settings → Functions,
   and Neon → Project → Region). If they differ, every round trip costs ~70–100 ms instead of ~5 ms. Moving
   the function region is a free setting.
2. **Turn on Real User Monitoring:** enable *Speed Insights* in the Vercel project, then add
   `@vercel/speed-insights` (`<SpeedInsights/>` in the root layout). This needs the dashboard switch first,
   otherwise the script returns 404. It is free on Hobby within its limits.
3. **See the new traces:** enable Vercel *Observability → Tracing*, or add a trace drain. Until then the spans are
   dropped at no cost, but the "slow database operation" lines still show up in Vercel logs.
4. **Optional: reuse the database pool between requests** (Neon `Pool` at module level with Vercel Fluid compute and
   `attachDatabasePool`). This saves the WebSocket and TLS connection setup on each request. The current per-request
   pool is a deliberate, documented choice, so this needs testing on a Preview deployment first.

## Reproduce

```sh
npx vitest run --config perf/vitest.config.ts
npm run build && npx playwright test --config perf/playwright.config.ts
```
