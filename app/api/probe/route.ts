import path from 'node:path';
import { assertVideoPath } from '@/lib/files';
import { probe } from '@/lib/ffmpeg';
import { fail, guard, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    guard(req);
    const abs = await assertVideoPath(new URL(req.url).searchParams.get('path'));
    const info = await probe(abs);
    return json({ ...info, path: abs, name: path.basename(abs) });
  } catch (e) {
    return fail(e);
  }
}
