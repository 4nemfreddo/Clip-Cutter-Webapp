import { fail, guard } from '@/lib/http';
import { subscribe } from '@/lib/jobs';
import type { JobState } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-Sent Events: pushes the job state as it changes.
export async function GET(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return fail(e);
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const enc = new TextEncoder();
  let unsub: (() => void) | undefined;
  let ping: NodeJS.Timeout | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsub?.();
        try { controller.close(); } catch { /* already closed */ }
      };
      const send = (data: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { close(); }
      };
      const u = subscribe(id, (job: JobState) => {
        send(job);
        if (job.status !== 'running') setTimeout(close, 50);
      });
      if (!u) {
        send({ error: 'Unknown job (the server may have restarted)' });
        close();
        return;
      }
      unsub = u;
      ping = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')); } catch { close(); }
      }, 15000);
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
      unsub?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
