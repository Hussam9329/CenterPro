-- Rest area: one row per finished game round. Additive only; no existing table changes.
-- Kept outside the revisioned state document so plays never conflict with admin edits.
CREATE TABLE IF NOT EXISTS centerpro.game_plays (
  id text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game IN ('wordle', 'minesweeper', 'snake', 'xo', 'connect4')),
  started_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 21600000),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100000),
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss', 'draw', 'end')),
  play_date text NOT NULL CHECK (play_date ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_plays_game_score_idx ON centerpro.game_plays (game, score DESC);
CREATE INDEX IF NOT EXISTS game_plays_employee_started_idx ON centerpro.game_plays (employee_id, started_at DESC);
-- The shared daily word can be finished once per employee per Baghdad day.
CREATE UNIQUE INDEX IF NOT EXISTS game_plays_daily_word_unique ON centerpro.game_plays (employee_id, play_date) WHERE game = 'wordle';
