import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { VIDEOS_DIR } from '@/lib/config';
import { VIDEO_EXTS } from '@/lib/files';
import { fail, guard, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    guard(req);
    await mkdir(VIDEOS_DIR, { recursive: true });
    const names = await readdir(VIDEOS_DIR);
    const items = await Promise.all(
      names
        .filter((n) => VIDEO_EXTS.has(path.extname(n).toLowerCase()))
        .map(async (n) => {
          const p = path.join(VIDEOS_DIR, n);
          const st = await stat(p);
          return { name: n, path: p, size: st.size, mtime: st.mtimeMs };
        }),
    );
    items.sort((a, b) => b.mtime - a.mtime);
    return json({ dir: VIDEOS_DIR, items });
  } catch (e) {
    return fail(e);
  }
}
