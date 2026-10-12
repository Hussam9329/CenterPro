export const AUTH_STORAGE_KEY = 'centerpro-local-auth-v1';
export const AUTH_SCHEMA_VERSION = 1;
/** Persist this descriptor with backups so a future server can verify existing hashes. */
export const AUTH_PASSWORD_KDF = Object.freeze({
  algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 150_000,
  saltBytes: 16, derivedKeyBytes: 32, encoding: 'base64',
  passwordEncoding: 'UTF-8', passwordNormalization: 'none',
} as const);
const PBKDF2_ITERATIONS = AUTH_PASSWORD_KDF.iterations;
const HASH_BYTES = AUTH_PASSWORD_KDF.derivedKeyBytes;

export interface StoredCredential {
  salt: string;
  hash: string;
  version: number;
  updatedAt: string;
}

export interface StoredSystemCredential extends StoredCredential {
  username: string;
}

export interface AuthStore {
  schema: number;
  system: StoredSystemCredential | null;
  employees: Record<string, StoredCredential>;
}

const emptyStore = (): AuthStore => ({ schema: AUTH_SCHEMA_VERSION, system: null, employees: {} });
let employeeResetRevision = 0;

function authStorage() {
  try {
    return typeof window !== 'undefined' && window.crypto?.subtle ? window.localStorage : null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validCredential(value: unknown): value is StoredCredential {
  if (!isRecord(value) || typeof value.salt !== 'string' || typeof value.hash !== 'string'
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  try {
    return base64ToBytes(value.salt).length === 16 && base64ToBytes(value.hash).length === HASH_BYTES;
  } catch {
    return false;
  }
}

function parseAuthStore(raw: string | null): AuthStore {
  if (!raw) return emptyStore();
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.schema !== AUTH_SCHEMA_VERSION || !isRecord(parsed.employees)
    || (parsed.system !== null && (!validCredential(parsed.system) || !isRecord(parsed.system)
      || typeof parsed.system.username !== 'string' || !normalizeUsername(parsed.system.username)))) {
    throw new Error('تعذر قراءة بيانات تسجيل الدخول المحفوظة.');
  }
  return {
    schema: AUTH_SCHEMA_VERSION,
    system: parsed.system as StoredSystemCredential | null,
    employees: Object.fromEntries(Object.entries(parsed.employees).filter(([, credential]) => validCredential(credential))) as Record<string, StoredCredential>,
  };
}

export function readAuthStore(): AuthStore {
  try {
    return parseAuthStore(authStorage()?.getItem(AUTH_STORAGE_KEY) ?? null);
  } catch {
    return emptyStore();
  }
}

/** Backup reads must fail visibly rather than silently discard unreadable accounts. */
export function assertAuthStoreForBackup(value: unknown): asserts value is AuthStore {
  const exactKeys = (record: Record<string, unknown>, keys: string[]) =>
    Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
  const credentialKeys = ['salt', 'hash', 'version', 'updatedAt'];
  const strictCredential = (credential: unknown, system = false) => {
    if (!isRecord(credential) || !validCredential(credential)
      || !exactKeys(credential, system ? [...credentialKeys, 'username'] : credentialKeys)) return false;
    // Generated credentials use canonical base64; accepting another representation
    // could hide a damaged or partially edited backup.
    return bytesToBase64(base64ToBytes(credential.salt)) === credential.salt
      && bytesToBase64(base64ToBytes(credential.hash)) === credential.hash;
  };
  if (!isRecord(value) || !exactKeys(value, ['schema', 'system', 'employees'])
    || value.schema !== AUTH_SCHEMA_VERSION || !isRecord(value.employees)
    || (value.system !== null && (!strictCredential(value.system, true) || !isRecord(value.system)
      || typeof value.system.username !== 'string' || !normalizeUsername(value.system.username)))
    || Object.entries(value.employees).some(([id, credential]) => !id.trim() || !strictCredential(credential))) {
    throw new Error('تعذر إنشاء نسخة كاملة: بيانات تسجيل الدخول المحفوظة غير صالحة. لم يتم حذف أو تغيير أي بيانات.');
  }
}

export function readAuthStoreForBackup(): AuthStore {
  const storage = authStorage();
  if (!storage) throw new Error('تعذر قراءة بيانات تسجيل الدخول للنسخة الاحتياطية من هذا المتصفح.');
  let parsed: unknown;
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    parsed = raw === null ? emptyStore() : JSON.parse(raw);
  } catch {
    throw new Error('تعذر قراءة بيانات تسجيل الدخول للنسخة الاحتياطية. لم يتم تغيير أي بيانات.');
  }
  assertAuthStoreForBackup(parsed);
  return parsed;
}

// Mutations must distinguish an empty installation from inaccessible or corrupt
// credentials: a read failure must never silently replace the existing owner.
function readWritableStore() {
  const storage = authStorage();
  if (!storage) throw new Error('تعذر الوصول إلى التخزين الآمن للمتصفح.');
  return parseAuthStore(storage.getItem(AUTH_STORAGE_KEY));
}

export function writeAuthStore(store: AuthStore) {
  const storage = authStorage();
  if (!storage) throw new Error('تعذر الوصول إلى التخزين الآمن للمتصفح.');
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function nextVersion(previousVersion = 0) {
  if (!Number.isSafeInteger(previousVersion) || previousVersion < 0 || previousVersion >= Number.MAX_SAFE_INTEGER) {
    throw new Error('تعذر تحديث إصدار بيانات تسجيل الدخول.');
  }
  return previousVersion + 1;
}

export async function createCredential(password: string, previousVersion = 0): Promise<StoredCredential> {
  if (password.length < 6) throw new Error('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.');
  if (!authStorage()) throw new Error('هذا المتصفح لا يدعم تشفير كلمات المرور المطلوب.');
  const version = nextVersion(previousVersion);
  const salt = window.crypto.getRandomValues(new Uint8Array(AUTH_PASSWORD_KDF.saltBytes));
  const hash = await derivePassword(password, salt);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(hash), version, updatedAt: new Date().toISOString() };
}

export async function verifyCredential(password: string, credential: StoredCredential) {
  try {
    if (!authStorage() || !validCredential(credential)) return false;
    const salt = base64ToBytes(credential.salt);
    const expected = base64ToBytes(credential.hash);
    const actual = await derivePassword(password, salt);
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

// Serialize the read/merge/write across tabs where Web Locks is available. The
// fallback still merges after hashing, preserving concurrent updates in one tab.
async function mutateStore<T>(mutation: () => T): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(AUTH_STORAGE_KEY, async () => mutation()) : mutation();
}

export async function configureSystemCredential(username: string, password: string, canCommit = () => true) {
  const cleanUsername = username.trim();
  if (!cleanUsername) throw new Error('أدخل اسم المستخدم.');
  if (readWritableStore().system) throw new Error('تم إعداد حساب مدير النظام مسبقاً.');
  const credential = await createCredential(password);
  return mutateStore(() => {
    const store = readWritableStore();
    if (!canCommit()) throw new Error('انتهت عملية إعداد الحساب. حاول مجدداً.');
    if (store.system) throw new Error('تم إعداد حساب مدير النظام مسبقاً.');
    const system: StoredSystemCredential = { ...credential, username: cleanUsername };
    writeAuthStore({ ...store, system });
    return system;
  });
}

export async function setEmployeeCredential(employeeId: string, password: string, canCommit = () => true) {
  if (!employeeId.trim()) throw new Error('حساب الموظف غير صالح.');
  readWritableStore();
  const resetRevision = employeeResetRevision;
  const credential = await createCredential(password);
  return mutateStore(() => {
    const store = readWritableStore();
    if (resetRevision !== employeeResetRevision || !canCommit()) throw new Error('انتهت عملية تغيير كلمة المرور. حاول مجدداً.');
    const current = { ...credential, version: nextVersion(store.employees[employeeId]?.version) };
    writeAuthStore({ ...store, employees: { ...store.employees, [employeeId]: current } });
    return current;
  });
}

export function removeEmployeeCredential(employeeId: string) {
  employeeResetRevision += 1;
  const store = readWritableStore();
  if (!Object.hasOwn(store.employees, employeeId)) return;
  const employees = { ...store.employees };
  delete employees[employeeId];
  writeAuthStore({ ...store, employees });
}

export function clearEmployeeCredentials() {
  employeeResetRevision += 1;
  const store = readWritableStore();
  writeAuthStore({ ...store, employees: {} });
}
