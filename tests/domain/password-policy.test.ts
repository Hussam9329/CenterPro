import { describe, expect, it } from 'vitest';
import { PASSWORD_RULE_MESSAGE, passwordProblem } from '../../src/lib/password-policy';

describe('password policy', () => {
  it('accepts passwords of 8+ characters mixing two kinds of characters', () => {
    for (const ok of ['Preview-not-a-real-password', 'changed-fixture-password', 'Atomic-test-password-73', 'new-secret', 'basra2026', 'كلمة_سر_قوية', 'Rk7#mQ2!']) {
      expect(passwordProblem(ok), ok).toBeNull();
    }
  });

  it('rejects short, single-kind and repeated passwords with the shared rule message', () => {
    for (const weak of ['short', '1234567', '12345678901', 'abcdefghij', 'aaaaaaaa', '--------', '']) {
      expect(passwordProblem(weak), weak).toBe(PASSWORD_RULE_MESSAGE);
    }
  });

  it('rejects passwords that cracking tools try first, case-insensitively', () => {
    for (const common of ['Password1', 'ABC12345', 'qwerty123', 'CenterPro123', 'admin123']) {
      expect(passwordProblem(common), common).toContain('شائعة');
    }
  });

  it('rejects passwords that contain the username', () => {
    expect(passwordProblem('mariam-2026', 'Mariam')).toContain('اسم المستخدم');
    expect(passwordProblem('mariam-2026', 'ali')).toBeNull();
    // Very short usernames are not treated as a match to avoid false positives.
    expect(passwordProblem('ab-secret-9', 'ab')).toBeNull();
  });

  it('caps the length so oversized input cannot burden the key derivation', () => {
    expect(passwordProblem(`a1${'x'.repeat(600)}`)).toBe(PASSWORD_RULE_MESSAGE);
  });
});
