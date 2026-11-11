import { assertVideoPath } from '@/lib/files';
import { probe } from '@/lib/ffmpeg';
import { HttpError, fail, guard, json } from '@/lib/http';
import { createJob } from '@/lib/jobs';
import type { ClipInput, EncoderKey, FormatKey, Quality, RenderRequest } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORMATS: FormatKey[] = ['original', 'blur', 'crop', 'square'];
const QUALITIES: Quality[] = ['fast', 'balanced', 'best'];
const ENCODERS: EncoderKey[] = ['auto', 'cpu', 'nvenc', 'qsv', 'amf'];

function parse(body: unknown, abs: string): RenderRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const clips: ClipInput[] = [];
  if (!Array.isArray(b.clips) || b.clips.length === 0) throw new HttpError(400, 'Add at least one clip');
  if (b.clips.length > 500) throw new HttpError(400, 'Too many clips (max 500)');
  for (const c of b.clips as Record<string, unknown>[]) {
    const start = Number(c?.start);
    const end = Number(c?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    clips.push({ name: String(c.name ?? 'clip').slice(0, 80), label: String(c.label ?? '').slice(0, 80), start, end });
  }
  const formats = (Array.isArray(b.formats) ? b.formats : []).filter((f): f is FormatKey => FORMATS.includes(f as FormatKey));
  if (formats.length === 0) throw new HttpError(400, 'Pick at least one output format');
  return {
    path: abs,
    clips,
    formats: [...new Set(formats)],
    quality: QUALITIES.includes(b.quality as Quality) ? (b.quality as Quality) : 'balanced',
    encoder: ENCODERS.includes(b.encoder as EncoderKey) ? (b.encoder as EncoderKey) : 'auto',
    normalize: b.normalize !== false,
    jobs: Number.isFinite(Number(b.jobs)) ? Number(b.jobs) : 0,
    skipExisting: b.skipExisting === true,
  };
}

export async function POST(req: Request) {
  try {
    guard(req, true);
    const body = await req.json();
    const abs = await assertVideoPath((body as { path?: string })?.path);
    const info = await probe(abs); // server re-checks duration + audio, never trusts the client
    const job = await createJob(abs, info, parse(body, abs));
    return json({ id: job.id, job });
  } catch (e) {
    return fail(e);
  }
}
