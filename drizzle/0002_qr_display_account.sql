ALTER TABLE centerpro.credentials DROP CONSTRAINT IF EXISTS credentials_check;
ALTER TABLE centerpro.credentials DROP CONSTRAINT IF EXISTS credentials_kind;
ALTER TABLE centerpro.credentials ADD CONSTRAINT credentials_kind CHECK (
  (account_key IN ('SYSTEM', 'QR_DISPLAY') AND employee_id IS NULL)
  OR (account_key NOT IN ('SYSTEM', 'QR_DISPLAY') AND employee_id IS NOT NULL AND employee_id = account_key)
);
