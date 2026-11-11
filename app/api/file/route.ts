import { OUTPUT_DIR } from '@/lib/config';
import { assertVideoPath, insideDir, serveFile } from '@/lib/files';
import { HttpError, fail, guard } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Serves finished clips (only from the output folder) for playback or download.
export async function GET(req: Request) {
  try {
    guard(req);
    const url = new URL(req.url);
    const abs = await assertVideoPath(url.searchParams.get('path'));
    if (!insideDir(OUTPUT_DIR, abs)) throw new HttpError(403, 'Outside the output folder');
    return await serveFile(req, abs, url.searchParams.get('download') === '1');
  } catch (e) {
    return fail(e);
  }
}
