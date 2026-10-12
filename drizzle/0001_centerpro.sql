CREATE SCHEMA IF NOT EXISTS centerpro;
CREATE TABLE centerpro.state (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  settings jsonb NOT NULL,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO centerpro.state(id, settings) VALUES (1, '{"centerName":"CenterPro","qrInterval":45}'::jsonb);

CREATE TABLE centerpro.departments (id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL);
CREATE TABLE centerpro.employees (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  department_id text NOT NULL REFERENCES centerpro.departments(id) DEFERRABLE INITIALLY DEFERRED,
  username text NOT NULL CHECK (btrim(username) <> ''), code text NOT NULL CHECK (btrim(code) <> '')
);
CREATE INDEX employees_department_idx ON centerpro.employees(department_id);
CREATE UNIQUE INDEX employees_username_unique ON centerpro.employees(lower(btrim(username)));
CREATE UNIQUE INDEX employees_code_unique ON centerpro.employees(code);
CREATE TABLE centerpro.workdays (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  date text NOT NULL, status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED'))
);
CREATE UNIQUE INDEX workdays_date_unique ON centerpro.workdays(date);
CREATE UNIQUE INDEX workdays_one_open ON centerpro.workdays(status) WHERE status = 'OPEN';
CREATE TABLE centerpro.attendance (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED,
  workday_id text NOT NULL REFERENCES centerpro.workdays(id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(employee_id, workday_id)
);
CREATE INDEX attendance_workday_idx ON centerpro.attendance(workday_id);
CREATE TABLE centerpro.deductions (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED, date text NOT NULL
);
CREATE INDEX deductions_employee_date_idx ON centerpro.deductions(employee_id, date);
CREATE TABLE centerpro.bonuses (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED, date text NOT NULL
);
CREATE INDEX bonuses_employee_date_idx ON centerpro.bonuses(employee_id, date);
CREATE TABLE centerpro.months (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  month text NOT NULL UNIQUE, status text NOT NULL CHECK (status IN ('OPEN', 'ARCHIVED', 'REOPENED'))
);
CREATE TABLE centerpro.payments (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED, month text NOT NULL
);
CREATE INDEX payments_employee_month_idx ON centerpro.payments(employee_id, month);
CREATE TABLE centerpro.audit (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL, employee_id text, timestamp text NOT NULL
);
CREATE INDEX audit_employee_timestamp_idx ON centerpro.audit(employee_id, timestamp);
CREATE TABLE centerpro.evaluation_seasons (id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL);
CREATE TABLE centerpro.evaluation_cycles (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  season_id text REFERENCES centerpro.evaluation_seasons(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX evaluation_cycles_season_idx ON centerpro.evaluation_cycles(season_id);
CREATE TABLE centerpro.evaluation_exams (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  cycle_id text NOT NULL REFERENCES centerpro.evaluation_cycles(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX evaluation_exams_cycle_idx ON centerpro.evaluation_exams(cycle_id);
CREATE TABLE centerpro.exam_evaluations (
  id text PRIMARY KEY, position integer NOT NULL, record jsonb NOT NULL,
  exam_id text NOT NULL REFERENCES centerpro.evaluation_exams(id) DEFERRABLE INITIALLY DEFERRED,
  employee_id text NOT NULL REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(exam_id, employee_id)
);
CREATE INDEX exam_evaluations_employee_idx ON centerpro.exam_evaluations(employee_id);
CREATE TABLE centerpro.credentials (
  account_key text PRIMARY KEY,
  employee_id text UNIQUE REFERENCES centerpro.employees(id) DEFERRABLE INITIALLY DEFERRED,
  credential jsonb NOT NULL,
  CHECK ((account_key = 'SYSTEM' AND employee_id IS NULL) OR (account_key <> 'SYSTEM' AND employee_id = account_key))
);
CREATE TABLE centerpro.sessions (
  token_hash text PRIMARY KEY,
  account_key text NOT NULL REFERENCES centerpro.credentials(account_key) ON DELETE CASCADE,
  auth_version bigint NOT NULL CHECK (auth_version BETWEEN 1 AND 9007199254740991),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), remembered boolean NOT NULL DEFAULT false
);
CREATE INDEX sessions_account_idx ON centerpro.sessions(account_key);
CREATE INDEX sessions_expires_idx ON centerpro.sessions(expires_at);
CREATE TABLE centerpro.login_rate_limits (
  key text PRIMARY KEY, count integer NOT NULL CHECK (count >= 0), window_started_at timestamptz NOT NULL, blocked_until timestamptz
);
CREATE INDEX login_rate_limits_window_idx ON centerpro.login_rate_limits(window_started_at);
CREATE TABLE centerpro.imports (
  digest text PRIMARY KEY CHECK (digest ~ '^[a-f0-9]{64}$'), imported_at timestamptz NOT NULL DEFAULT now(), source_revision bigint NOT NULL,
  counts jsonb NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- No anonymous database role may read private records, password hashes or tokens.
-- The server connects with the supplied owner credential; application permissions
-- are separately enforced before each transaction. Never expose DATABASE_URL.
REVOKE ALL ON SCHEMA centerpro FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA centerpro FROM PUBLIC;
ALTER TABLE centerpro.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.workdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.months ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.evaluation_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.evaluation_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.exam_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.login_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE centerpro.imports ENABLE ROW LEVEL SECURITY;
