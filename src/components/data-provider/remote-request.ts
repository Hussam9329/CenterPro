export class RemoteRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function remoteRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new RemoteRequestError('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى. لم يتم تأكيد حفظ التغيير.', 0); }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new RemoteRequestError('لم تصل استجابة صالحة من الخادم. حدّث البيانات وتحقق من النتيجة قبل إعادة المحاولة.', response.status); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error : 'تعذر تنفيذ العملية. حاول مرة أخرى.';
    throw new RemoteRequestError(message, response.status);
  }
  return result as T;
}
