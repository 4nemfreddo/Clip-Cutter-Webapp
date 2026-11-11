import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OUTPUT_DIR, ffmpegPath } from './config';
import { ENCODER_LABEL, buildArgs, resolveEncoder, systemInfo } from './ffmpeg';
import { HttpError } from './http';
import { FORMAT_FOLDERS, type JobState, type ProbeInfo, type RenderRequest, type TaskState } from './types';

type Listener = (job: JobState) => void;

interface Runtime {
  state: JobState;
  procs: Set<ChildProcess>;
  listeners: Set<Listener>;
  cancelled: boolean;
  timer?: NodeJS.Timeout;
}

// Survives hot-reloads in dev
const g = globalThis as unknown as { __clipJobs?: Map<string, Runtime> };
const store: Map<string, Runtime> = (g.__clipJobs ??= new Map());

function flush(rt: Runtime) {
  for (const l of rt.listeners) l(rt.state);
}
function emit(rt: Runtime, now = false) {
  if (now) {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = undefined;
    flush(rt);
    return;
  }
  if (rt.timer) return;
  rt.timer = setTimeout(() => {
    rt.timer = undefined;
    flush(rt);
  }, 150);
}

const safe = (s: string) => s.replace(/[^\w\-.]+/g, '_').replace(/^\.+/, '') || 'clip';
const exists = async (p: string) => {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
};

export async function createJob(input: string, info: ProbeInfo, req: RenderRequest): Promise<JobState> {
  const sys = await systemInfo();
  if (!sys.ok) throw new HttpError(500, 'FFmpeg was not found. Set FFMPEG_PATH in .env.local or add ffmpeg to PATH.');

  const encoder = resolveEncoder(req.encoder, req.quality, sys.encoders);
  const defaultJobs = encoder === 'cpu' ? Math.max(1, Math.min(4, Math.floor(sys.cores / 4))) : 2;
  const workers = Math.max(1, Math.min(6, req.jobs > 0 ? Math.floor(req.jobs) : defaultJobs));

  const sourceDir = safe(path.parse(input).name);
  const used = new Set<string>();
  const tasks: TaskState[] = [];

  for (const c of req.clips) {
    const start = Math.max(0, c.start);
    const end = info.duration > 0 ? Math.min(c.end, info.duration) : c.end;
    if (end - start < 0.5) continue; // too short or out of range
    let name = safe(c.name) + (c.label ? '_' + safe(c.label) : '');
    for (let n = 2; used.has(name); n++) name = `${safe(c.name)}-${n}`;
    used.add(name);
    for (const f of req.formats) {
      tasks.push({
        id: `${name}:${f}`,
        name,
        format: f,
        start,
        dur: end - start,
        status: 'queued',
        progress: 0,
        outPath: path.join(OUTPUT_DIR, sourceDir, FORMAT_FOLDERS[f], name + '.mp4'),
      });
    }
  }
  if (tasks.length === 0) throw new HttpError(400, 'No valid clips to render (each must be at least 0.5s and inside the video).');

  const id = Math.random().toString(36).slice(2, 10);
  const state: JobState = {
    id,
    source: path.basename(input),
    status: 'running',
    tasks,
    startedAt: Date.now(),
    encoder: ENCODER_LABEL[encoder],
    jobs: workers,
    outDir: path.join(/*turbopackIgnore: true*/ OUTPUT_DIR, sourceDir),
  };
  const rt: Runtime = { state, procs: new Set(), listeners: new Set(), cancelled: false };
  store.set(id, rt);

  // keep memory tidy: drop the oldest finished jobs beyond 20
  if (store.size > 20) {
    for (const [k, v] of store) {
      if (v.state.status !== 'running' && store.size > 20) store.delete(k);
    }
  }

  void runJob(rt, input, info, req, encoder, workers);
  return state;
}

async function runJob(
  rt: Runtime, input: string, info: ProbeInfo, req: RenderRequest,
  encoder: ReturnType<typeof resolveEncoder>, workers: number,
) {
  const queue = [...rt.state.tasks];
  const worker = async () => {
    while (queue.length > 0 && !rt.cancelled) {
      const task = queue.shift()!;
      await runTask(rt, task, input, info, req, encoder);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  for (const t of rt.state.tasks) if (t.status === 'queued') t.status = 'cancelled';
  rt.state.status = rt.cancelled ? 'cancelled' : 'done';
  rt.state.finishedAt = Date.now();
  emit(rt, true);
}

async function runTask(
  rt: Runtime, task: TaskState, input: string, info: ProbeInfo, req: RenderRequest,
  encoder: ReturnType<typeof resolveEncoder>,
) {
  if (req.skipExisting && (await exists(task.outPath))) {
    task.status = 'skipped';
    task.progress = 1;
    task.size = (await stat(task.outPath)).size;
    emit(rt);
    return;
  }
  await mkdir(path.dirname(task.outPath), { recursive: true });
  const tmp = task.outPath + '.part';
  const t0 = Date.now();
  task.status = 'running';
  emit(rt);

  const args = buildArgs({
    input, output: tmp, start: task.start, dur: task.dur, format: task.format,
    encoder, quality: req.quality, normalize: req.normalize, hasAudio: info.hasAudio,
  });
  const child = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  rt.procs.add(child);
  try {
    if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); // keep the PC usable
  } catch { /* not critical */ }

  let buf = '';
  child.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const m = /^out_time_(?:us|ms)=(-?\d+)/.exec(line);
      if (m) {
        task.progress = Math.min(1, Math.max(0, Number(m[1]) / 1e6 / task.dur));
        emit(rt);
      }
    }
  });
  let errTail = '';
  child.stderr.on('data', (d: Buffer) => {
    errTail = (errTail + d.toString()).slice(-1500);
  });

  const code = await new Promise<number | null>((resolve) => {
    child.on('error', (e) => {
      errTail += String(e);
      resolve(-1);
    });
    child.on('close', (c) => resolve(c));
  });
  rt.procs.delete(child);

  if (code === 0 && (await exists(tmp))) {
    await rename(tmp, task.outPath);
    task.status = 'done';
    task.progress = 1;
    task.size = (await stat(task.outPath)).size;
    task.seconds = (Date.now() - t0) / 1000;
  } else {
    await unlink(tmp).catch(() => {});
    if (rt.cancelled) {
      task.status = 'cancelled';
    } else {
      task.status = 'failed';
      task.error = errTail.trim().split('\n').slice(-3).join('\n') || `ffmpeg exited with code ${code}`;
    }
  }
  emit(rt, true);
}

export function subscribe(id: string, cb: Listener): (() => void) | undefined {
  const rt = store.get(id);
  if (!rt) return undefined;
  rt.listeners.add(cb);
  cb(rt.state);
  return () => rt.listeners.delete(cb);
}

export function cancelJob(id: string): boolean {
  const rt = store.get(id);
  if (!rt) return false;
  rt.cancelled = true;
  for (const t of rt.state.tasks) if (t.status === 'queued') t.status = 'cancelled';
  for (const p of rt.procs) p.kill();
  emit(rt, true);
  return true;
}
