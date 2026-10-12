import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import type { DemoData } from '@/lib/types';

export const MAX_PHOTO_BYTES = 1024 * 1024;
const MAX_STORED_BYTES = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 100;
const referencePattern = /^\/api\/photos\/([a-f0-9]{64})$/;
const imagePattern = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const hashData = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const storagePath = (hash: string) => `centerpro/photos/${hash}`;

export class PhotoValidationError extends Error {
  constructor() { super('تحتوي البيانات على صورة غير صالحة. الصور المدعومة PNG وJPG وWebP وبحجم لا يزيد عن 1 ميغابايت. لم يتم حذف أي بيانات.'); this.name = 'PhotoValidationError'; }
}

/** Do not optimize/re-encode: the original data URL is required for lossless backup. */
function decodePhoto(value: string): { bytes: Uint8Array; contentType: string } {
  if (value.length > MAX_STORED_BYTES) throw new PhotoValidationError();
  const match = imagePattern.exec(value);
  if (!match) throw new PhotoValidationError();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== match[2]) throw new PhotoValidationError();
  const type = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!(type === 'image/png' && png) && !(type === 'image/jpeg' && jpeg) && !(type === 'image/webp' && webp)) throw new PhotoValidationError();
  return { bytes: new Uint8Array(bytes), contentType: type };
}

function strings(value: unknown, visit: (value: string, key?: string) => void, key?: string): void {
  if (typeof value === 'string') visit(value, key);
  else if (Array.isArray(value)) for (const item of value) strings(item, visit);
  else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) strings(child, visit, childKey);
}

/** Portable backups must carry image contents, not references to a different store. */
export function validatePhotoData(data: DemoData, portable = false): void {
  strings(data, (value, key) => {
    if (value.startsWith('data:image')) decodePhoto(value);
    else if (value && key === 'photo' && (!referencePattern.test(value) || portable)) throw new PhotoValidationError();
    else if (portable && referencePattern.test(value)) throw new PhotoValidationError();
  });
}

/** Persistence guard: callers must complete object uploads before writing rows. */
export function assertPhotosExternalized(data: DemoData): void {
  strings(data, value => { if (value.startsWith('data:image')) throw new Error('Inline images must be saved to private object storage before database persistence.'); });
}

export function photoReference(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new PhotoValidationError();
  return `/api/photos/${hash}`;
}

export function photoHashes(data: DemoData): Set<string> {
  const hashes = new Set<string>();
  // Authorization follows actual profile image slots, never arbitrary notes,
  // extension fields or audit text which might contain a copied private URL.
  for (const employee of [...data.employees, ...data.months.flatMap(month => month.sourceSnapshot?.employees ?? [])]) {
    const match = referencePattern.exec(employee.photo ?? '');
    if (match) hashes.add(match[1]);
  }
  return hashes;
}

async function readStored(hash: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const result = await get(storagePath(hash), { access: 'private', useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200 || result.blob.size > MAX_STORED_BYTES) throw new PhotoValidationError();
  const reader = result.stream.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_STORED_BYTES) { await reader.cancel(); throw new PhotoValidationError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (hashData(value) !== hash) throw new PhotoValidationError();
  decodePhoto(value);
  return value;
}

async function storePhoto(value: string): Promise<string> {
  decodePhoto(value);
  const hash = hashData(value);
  const existing = await readStored(hash);
  if (existing !== null) return photoReference(hash);
  try {
    // Hash-derived immutable names deduplicate archive copies and retries. Exact
    // original text lives privately in object storage; PostgreSQL stores a URL.
    await put(storagePath(hash), value, { access: 'private', contentType: 'text/plain; charset=utf-8', addRandomSuffix: false, allowOverwrite: false });
  } catch (error) {
    // A concurrent request may have created the same content-addressed object.
    // Do not overwrite or delete it; verify before treating the retry as success.
    if (await readStored(hash) !== value) throw error;
  }
  return photoReference(hash);
}

async function mapStrings(value: unknown, convert: (value: string) => Promise<string>): Promise<unknown> {
  if (typeof value === 'string') return convert(value);
  if (Array.isArray(value)) {
    const output = [];
    for (const item of value) output.push(await mapStrings(item, convert));
    return output;
  }
  if (value && typeof value === 'object') {
    const entries: [string, unknown][] = [];
    for (const [key, child] of Object.entries(value)) entries.push([key, await mapStrings(child, convert)]);
    return Object.fromEntries(entries);
  }
  return value;
}

/** Does not mutate the source. Shared photo copies are uploaded just once. Blob
 * failures prevent the subsequent database commit; no destructive cleanup runs. */
export async function externalizePhotos(data: DemoData): Promise<DemoData> {
  validatePhotoData(data);
  const cached = new Map<string, Promise<string>>();
  return await mapStrings(data, value => {
    if (!value.startsWith('data:image')) return Promise.resolve(value);
    if (!cached.has(value)) cached.set(value, storePhoto(value));
    return cached.get(value)!;
  }) as DemoData;
}

/** A missing/corrupt object fails the FULL backup rather than omitting a photo. */
export async function inlinePhotos(data: DemoData): Promise<DemoData> {
  const cached = new Map<string, Promise<string>>();
  return await mapStrings(data, value => {
    const match = referencePattern.exec(value);
    if (!match) return Promise.resolve(value);
    const hash = match[1];
    if (!cached.has(hash)) cached.set(hash, readStored(hash).then(photo => {
      if (photo === null) throw new Error('تعذر تحميل صورة محفوظة لإكمال النسخة الاحتياطية. لم يتم إنشاء نسخة ناقصة.');
      return photo;
    }));
    return cached.get(hash)!;
  }) as DemoData;
}

/** Call ONLY after authorization against photoHashes(projectData(...)). */
export async function readPhoto(hash: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const value = await readStored(hash);
  return value === null ? null : decodePhoto(value);
}
