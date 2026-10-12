import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createInitialData } from '@/lib/mock-data';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { captureMonthSource } from '@/components/finance/finance-data';
import { externalizePhotos, inlinePhotos, MAX_PHOTO_BYTES, photoHashes, photoReference, readPhoto, validatePhotoData } from '@/server/photos';

const storage = vi.hoisted(() => ({ values: new Map<string, string>(), puts: 0, failure: false }));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: string, options: { access: string; allowOverwrite: boolean; addRandomSuffix: boolean }) => {
    if (options.access !== 'private' || options.allowOverwrite || options.addRandomSuffix) throw new Error('Unsafe storage');
    if (storage.failure) throw new Error('Upload failed');
    storage.puts += 1; storage.values.set(path, body); return { pathname: path };
  }),
  get: vi.fn(async (path: string, options: { access: string }) => {
    if (options.access !== 'private') throw new Error('Unsafe storage');
    const body = storage.values.get(path);
    return body === undefined ? null : { statusCode: 200, stream: new Response(body).body, blob: { size: Buffer.byteLength(body) } };
  }),
}));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYbQAAAAASUVORK5CYII=';
beforeEach(() => { storage.values.clear(); storage.puts = 0; storage.failure = false; });

describe('private object storage photos', () => {
  it('externalizes every nested photo exactly once and rehydrates byte-for-byte without mutating source', async () => {
    const data = createPopulatedTestData(); data.employees[0].photo = png;
    data.months[0].sourceSnapshot = captureMonthSource(data, data.months[0].month);
    data.audit[0].oldValues.photo = png;
    Object.assign(data, { futureImage: png });
    const original = structuredClone(data);
    const result = await externalizePhotos(data);
    expect(data).toEqual(original); expect(JSON.stringify(result)).not.toContain('data:image');
    expect(storage.puts).toBe(1); expect(photoHashes(result).size).toBe(1);
    expect(await inlinePhotos(result)).toEqual(original);
    await externalizePhotos(data); expect(storage.puts).toBe(1);
    const hash = [...photoHashes(result)][0]; const image = await readPhoto(hash);
    expect(image?.contentType).toBe('image/png'); expect(Buffer.from(image!.bytes).toString('base64')).toBe(png.split(',')[1]);
  });
  it('fails closed for corrupt/missing objects, invalid image bytes, oversized uploads and external references', async () => {
    const data = createPopulatedTestData(); data.employees[0].photo = png;
    const result = await externalizePhotos(data); const hash = [...photoHashes(result)][0];
    storage.values.set(`centerpro/photos/${hash}`, `${png}corrupted`);
    await expect(inlinePhotos(result)).rejects.toThrow();
    storage.values.clear(); await expect(inlinePhotos(result)).rejects.toThrow(/صورة/);
    expect(await readPhoto(hash)).toBeNull(); expect(await readPhoto('../../secret')).toBeNull();
    data.employees[0].photo = 'data:image/png;base64,ZmFrZQ=='; expect(() => validatePhotoData(data, true)).toThrow();
    data.employees[0].photo = `data:image/png;base64,${Buffer.alloc(MAX_PHOTO_BYTES + 1).toString('base64')}`; expect(() => validatePhotoData(data, true)).toThrow();
    data.employees[0].photo = 'https://attacker.example/private-file'; expect(() => validatePhotoData(data, true)).toThrow();
    data.employees[0].photo = photoReference(hash); expect(() => validatePhotoData(data, true)).toThrow();
    expect(() => validatePhotoData(data)).not.toThrow();
  });
  it('keeps the original inline data when an upload fails and uses content-derived private paths', async () => {
    const data = createPopulatedTestData(); data.employees[0].photo = png; storage.failure = true;
    await expect(externalizePhotos(data)).rejects.toThrow('Upload failed'); expect(data.employees[0].photo).toBe(png);
    storage.failure = false; const result = await externalizePhotos(data);
    const hash = createHash('sha256').update(png).digest('hex');
    expect(result.employees[0].photo).toBe(`/api/photos/${hash}`);
    expect(storage.values.get(`centerpro/photos/${hash}`)).toBe(png);
    expect(await externalizePhotos(createInitialData())).toEqual(createInitialData());
    const forged = createInitialData(); Object.assign(forged, { note: `/api/photos/${hash}`, photo: `/api/photos/${hash}` });
    expect(photoHashes(forged).size).toBe(0);
  });
});
