/** Same-origin, non-cached requests. No credentials live in browser storage. */
export async function apiRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Same limit as the state requests: a hung connection fails instead of spinning forever.
    signal: AbortSignal.timeout(30_000),
  }).catch(() => { throw new Error('تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.'); });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
  return result as T;
}
