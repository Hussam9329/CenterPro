import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
};

/** Chunked responses keep inline employee photos and backups out of Vercel's
 * buffered response limit. Nothing authenticated is stored in a shared cache. */
export function jsonResponse(value: unknown, status = 200): NextResponse {
  const json = JSON.stringify(value);
  const encoder = new TextEncoder();
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= json.length) { controller.close(); return; }
      let end = Math.min(offset + 32_768, json.length);
      // Avoid splitting a UTF-16 surrogate pair between TextEncoder calls.
      const code = json.charCodeAt(end - 1);
      if (end < json.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
      controller.enqueue(encoder.encode(json.slice(offset, end)));
      offset = end;
    },
  });
  return new NextResponse(body, { status, headers: { ...NO_STORE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function apiRoute(operation: () => Promise<NextResponse>): Promise<NextResponse> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ApiError) return jsonResponse({ error: error.message }, error.status);
    // Database drivers can attach SQL, connection strings and row values to
    // errors. Neither responses nor server logs receive those objects.
    return jsonResponse({ error: 'تعذر الاتصال بالخادم أو حفظ العملية. حاول مجدداً.' }, 503);
  }
}

/** A caller cannot nominate another origin in a JSON body or forwarded header. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const ownOrigin = new URL(request.url).origin;
  if (!origin || origin === 'null' || origin !== ownOrigin) {
    throw new ApiError(403, 'مصدر الطلب غير مسموح. افتح النظام من رابطه الأصلي.');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new ApiError(403, 'مصدر الطلب غير مسموح.');
  }
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'يجب إرسال الطلب بصيغة JSON.');
  }
}

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 4 * 1024 * 1024): Promise<T> {
  assertSameOrigin(request);
  const statedLength = Number(request.headers.get('content-length'));
  if (statedLength > maxBytes) throw new ApiError(413, 'حجم البيانات أكبر من الحد المسموح للطلب.');
  if (!request.body) throw new ApiError(400, 'الطلب فارغ.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let source = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new ApiError(413, 'حجم البيانات أكبر من الحد المسموح للطلب.'); }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'ترميز الطلب غير صالح.');
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new ApiError(400, 'صيغة الطلب غير صالحة.'); }
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'بيانات الطلب غير صالحة. تحقق من الحقول المطلوبة.');
  return result.data;
}
