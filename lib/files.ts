import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { HttpError } from './http';

export const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi']);

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

/** Resolve a user-supplied path to an existing video file or throw. */
export async function assertVideoPath(p: unknown): Promise<string> {
  if (typeof p !== 'string' || !p.trim()) throw new HttpError(400, 'Missing path');
  const abs = path.resolve(p.trim().replace(/^"(.*)"$/, '$1')); // handles Windows "Copy as path"
  if (!VIDEO_EXTS.has(path.extname(abs).toLowerCase())) throw new HttpError(400, 'Not a supported video file');
  try {
    const st = await stat(abs);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    throw new HttpError(404, 'File not found');
  }
  return abs;
}

export function insideDir(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Stream a file with HTTP Range support (needed so the <video> element can seek). */
export async function serveFile(req: Request, abs: string, download = false): Promise<Response> {
  const size = (await stat(abs)).size;
  const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  if (download) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`);
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      if (m[1] === '' && m[2] !== '') {
        start = Math.max(0, size - Number(m[2]));
      } else {
        if (m[1] !== '') start = Number(m[1]);
        if (m[2] !== '') end = Math.min(size - 1, Number(m[2]));
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      status = 206;
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }
  }
  headers.set('Content-Length', String(end - start + 1));

  const node = createReadStream(abs, { start, end });
  req.signal.addEventListener('abort', () => node.destroy());
  return new Response(Readable.toWeb(node) as unknown as ReadableStream, { status, headers });
}
