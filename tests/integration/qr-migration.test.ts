import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('QR display upgrade of an existing database', () => {
  it('preserves existing records, credentials and sessions while enforcing standalone account kinds', async () => {
    const client = new PGlite();
    try {
      await client.exec(await readFile(new URL('../../drizzle/0001_centerpro.sql', import.meta.url), 'utf8'));
      await client.exec(`
        INSERT INTO centerpro.departments VALUES ('department', 0, '{"name":"existing department"}');
        INSERT INTO centerpro.employees VALUES ('employee', 0, '{"name":"existing employee"}', 'department', 'existing-user', 'E1');
        INSERT INTO centerpro.credentials VALUES ('SYSTEM', NULL, '{"version":1}'), ('employee', 'employee', '{"version":2}');
        INSERT INTO centerpro.sessions(token_hash, account_key, auth_version, expires_at) VALUES
          ('owner-session', 'SYSTEM', 1, '2030-01-01'), ('employee-session', 'employee', 2, '2030-01-01');
      `);
      const snapshot = async () => Promise.all(['state', 'departments', 'employees', 'credentials', 'sessions'].map(async table =>
        (await client.query(`SELECT * FROM centerpro.${table} ORDER BY 1`)).rows));
      const before = await snapshot();
      const migration = await readFile(new URL('../../drizzle/0002_qr_display_account.sql', import.meta.url), 'utf8');
      await client.exec(`BEGIN; ${migration} COMMIT;`);
      expect(await snapshot()).toEqual(before);
      await client.query("INSERT INTO centerpro.credentials VALUES ('QR_DISPLAY', NULL, '{\"version\":1}')");
      await client.query("INSERT INTO centerpro.sessions(token_hash, account_key, auth_version, expires_at) VALUES ('qr-session', 'QR_DISPLAY', 1, '2030-01-01')");
      await expect(client.query("INSERT INTO centerpro.credentials VALUES ('orphan', NULL, '{}')")).rejects.toThrow();
      await expect(client.query("UPDATE centerpro.credentials SET employee_id = 'employee' WHERE account_key = 'QR_DISPLAY'")).rejects.toThrow();
      await expect(client.query("UPDATE centerpro.credentials SET employee_id = NULL WHERE account_key = 'employee'")).rejects.toThrow();
      await expect(client.query("INSERT INTO centerpro.credentials VALUES ('wrong-key', 'employee', '{}')")).rejects.toThrow();
      await client.exec(`BEGIN; ${migration} COMMIT;`);
      expect((await client.query('SELECT * FROM centerpro.sessions')).rows).toHaveLength(3);
    } finally { await client.close(); }
  }, 30_000);
});
