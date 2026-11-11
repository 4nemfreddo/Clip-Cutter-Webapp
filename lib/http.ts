export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function fail(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
}

/**
 * This app reads and writes files on your machine, so it only answers to localhost.
 * (Set ALLOW_REMOTE=1 to disable this check - not recommended.)
 */
export function guard(req: Request, needJson = false): void {
  if (process.env.ALLOW_REMOTE === '1') return;
  const host = (req.headers.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new HttpError(403, 'Local access only');
  if (needJson && !(req.headers.get('content-type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'JSON body required');
  }
}
