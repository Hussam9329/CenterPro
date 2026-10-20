# Rest area (استراحة)

Light games for employees' break time, with leaderboards and owner-only play statistics.

## What it adds

- Employee menu **استراحة** (`/employee/rest`): Wordle with a shared daily Arabic word, Minesweeper, Snake, and XO and Connect 4 for two players on the same device.
- Leaderboards: today's daily-word solvers (fewer attempts ranks higher), plus the best score per employee for Minesweeper and Snake.
- Owner menu **إحصائيات الاستراحة** (`/rest-stats`, SUPER_ADMIN only). It shows totals, per-game and per-employee breakdowns (rounds, total time, first and last play), and the latest rounds with start time, duration and result.

Games are client components (`src/components/rest/games/*`) and never fetch or store anything themselves. The play page records each finished round through `POST /api/rest/plays`. The server validates the game, the score range, the outcome and the timing. It allows at most 20 rounds per employee per minute, and the daily word once per employee per Baghdad day.

## Database

Plays live in their own table `centerpro.game_plays` (migration `drizzle/0003_game_plays.sql`). They stay outside the revisioned state document, so game activity never conflicts with admin edits. The migration is additive and changes no existing table. Deleting an employee deletes their plays.

**Run the migration on the production database once, before deploying this release:**

```
npm run db:migrate -- --check
npm run db:migrate
npm run db:migrate -- --check
```

1. The first `--check` should print `PENDING`.
2. `db:migrate` applies the migration.
3. The second `--check` should print `CURRENT`.

Run these from an environment whose `DATABASE_URL` points at the production Neon database. Never commit that value or paste it into chat.

The browser-only preview (no `DATABASE_URL`) stores plays in `localStorage` (`centerpro-rest-plays-v1`) on that device.
