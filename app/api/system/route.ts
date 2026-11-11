import { systemInfo } from '@/lib/ffmpeg';
import { fail, guard, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    guard(req);
    return json(await systemInfo());
  } catch (e) {
    return fail(e);
  }
}
