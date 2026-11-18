-- Private to-do list. Additive only; no existing table changes.
-- Rows are owned by one login account and the account is part of the primary key, so
-- the same id can never address another account's task. Kept outside the revisioned
-- state document: tasks never reach snapshots, the audit log or system backups.
CREATE TABLE IF NOT EXISTS centerpro.todos (
  account_key text NOT NULL REFERENCES centerpro.credentials(account_key) ON DELETE CASCADE CHECK (account_key <> 'QR_DISPLAY'),
  id text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
  due_date text CHECK (due_date ~ '^\d{4}-\d{2}-\d{2}$'),
  due_time text CHECK (due_time ~ '^\d{2}:\d{2}$'),
  subtasks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(subtasks) = 'array'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_key, id),
  CONSTRAINT todos_time_needs_date CHECK (due_time IS NULL OR due_date IS NOT NULL)
);
