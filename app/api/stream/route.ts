import { assertVideoPath, serveFile } from '@/lib/files';
import { fail, guard } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    guard(req);
    const abs = await assertVideoPath(new URL(req.url).searchParams.get('path'));
    return await serveFile(req, abs);
  } catch (e) {
    return fail(e);
  }
}
