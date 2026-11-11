import { fail, guard, json } from '@/lib/http';
import { cancelJob } from '@/lib/jobs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    guard(req, true);
    const body = (await req.json()) as { id?: string };
    return json({ ok: cancelJob(String(body.id ?? '')) });
  } catch (e) {
    return fail(e);
  }
}
