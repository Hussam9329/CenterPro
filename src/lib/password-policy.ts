/**
 * Single password rule for every place a password is chosen (server and browser).
 * The server enforces it; forms show the same message early. Existing passwords
 * keep working; the rule applies when a password is set or changed.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 512;
export const PASSWORD_RULE_MESSAGE = 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل، وتجمع بين حروف وأرقام أو رموز.';

// Passwords that automated cracking tools try first. Compared case-insensitively.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyui', '1q2w3e4r', '1qaz2wsx',
  'abc12345', 'abcd1234', 'aa123456', 'iloveyou', 'admin123', 'admin1234', 'welcome1', 'letmein1',
  'centerpro', 'centerpro1', 'centerpro123', 'center123', 'iraq1234', 'baghdad1', 'baghdad123',
]);

function classes(password: string): number {
  let count = 0;
  if (/\p{L}/u.test(password)) count++;
  if (/\p{N}/u.test(password)) count++;
  if (/[^\p{L}\p{N}]/u.test(password)) count++;
  return count;
}

/** Returns a user-facing problem, or null when the password is acceptable. */
export function passwordProblem(password: string, username = ''): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return PASSWORD_RULE_MESSAGE;
  if (classes(password) < 2 || /^(.)\1+$/u.test(password)) return PASSWORD_RULE_MESSAGE;
  if (COMMON.has(password.toLowerCase())) return 'كلمة المرور هذه شائعة وسهلة التخمين. اختر كلمة مرور أخرى.';
  const user = username.trim().toLowerCase();
  if (user.length >= 3 && password.toLowerCase().includes(user)) return 'لا تستخدم اسم المستخدم داخل كلمة المرور.';
  return null;
}
