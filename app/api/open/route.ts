import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_DIR } from '@/lib/config';
import { insideDir } from '@/lib/files';
import { HttpError, fail, guard, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Show in folder" for the output directory.
export async function POST(req: Request) {
  try {
    guard(req, true);
    const body = (await req.json()) as { path?: string };
    const dir = path.resolve(String(body.path ?? OUTPUT_DIR));
    if (!insideDir(OUTPUT_DIR, dir)) throw new HttpError(403, 'Outside the output folder');
    await mkdir(dir, { recursive: true });
    const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(cmd, [dir], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
