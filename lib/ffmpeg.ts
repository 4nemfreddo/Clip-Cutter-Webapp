import { spawn } from 'node:child_process';
import os from 'node:os';
import { OUTPUT_DIR, VIDEOS_DIR, ffmpegPath, ffprobePath } from './config';
import type { EncoderKey, FormatKey, ProbeInfo, Quality, SystemInfo } from './types';

export type ResolvedEncoder = Exclude<EncoderKey, 'auto'>;

// ---------------------------------------------------------------- process helper
export function run(cmd: string, args: string[], timeoutMs = 15000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const child = spawn(cmd, args, { windowsHide: true });
    timer = setTimeout(() => {
      child.kill();
      done(null);
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      stderr += String(e);
      done(-1);
    });
    child.on('close', (c) => done(c));
  });
}

// ---------------------------------------------------------------- probe
export async function probe(file: string): Promise<ProbeInfo> {
  const r = await run(
    ffprobePath(),
    ['-v', 'error', '-print_format', 'json', '-show_entries',
     'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate', '-i', file],
    30000,
  );
  if (r.code !== 0) {
    const last = r.stderr.trim().split('\n').pop() || 'is ffprobe installed?';
    throw new Error(`ffprobe failed: ${last}`);
  }
  const j = JSON.parse(r.stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }[];
  };
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('No video stream found in this file');
  let fps = 30;
  const m = /^(\d+)\/(\d+)$/.exec(v.r_frame_rate ?? '');
  if (m && Number(m[2]) > 0) fps = Number(m[1]) / Number(m[2]);
  return {
    duration: Number(j.format?.duration ?? 0),
    width: v.width ?? 0,
    height: v.height ?? 0,
    fps: fps > 0 && fps < 240 ? fps : 30,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    videoCodec: v.codec_name ?? '',
  };
}

// ---------------------------------------------------------------- system / encoders
async function testEncoder(name: string): Promise<boolean> {
  const r = await run(ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.2',
    '-frames:v', '1', '-c:v', name, '-f', 'null', '-',
  ], 20000);
  return r.code === 0;
}

async function detect(): Promise<SystemInfo> {
  const base = {
    ffmpegPath: ffmpegPath(),
    cores: os.availableParallelism?.() ?? os.cpus().length,
    videosDir: VIDEOS_DIR,
    outputDir: OUTPUT_DIR,
  };
  const v = await run(ffmpegPath(), ['-version'], 10000);
  if (v.code !== 0) return { ok: false, version: '', encoders: [], ...base };
  const found = await Promise.all(
    (['nvenc', 'qsv', 'amf'] as const).map(async (e) => ((await testEncoder(`h264_${e}`)) ? e : null)),
  );
  return {
    ok: true,
    version: v.stdout.split('\n')[0]?.trim() ?? '',
    encoders: ['cpu', ...found.filter((e): e is 'nvenc' | 'qsv' | 'amf' => e !== null)],
    ...base,
  };
}

const g = globalThis as unknown as { __clipSys?: Promise<SystemInfo> };

export async function systemInfo(): Promise<SystemInfo> {
  if (!g.__clipSys) g.__clipSys = detect();
  const info = await g.__clipSys;
  if (!info.ok) g.__clipSys = undefined; // retry next time, e.g. after the user fixes FFMPEG_PATH
  return info;
}

export function resolveEncoder(requested: EncoderKey, quality: Quality, available: string[]): ResolvedEncoder {
  if (requested === 'auto') {
    // x264 gives the prettiest result per MB, so a GPU is only auto-picked for "fast"
    if (quality === 'fast') {
      for (const e of ['nvenc', 'qsv', 'amf'] as const) if (available.includes(e)) return e;
    }
    return 'cpu';
  }
  if (requested === 'cpu') return 'cpu';
  return available.includes(requested) ? requested : 'cpu';
}

export const ENCODER_LABEL: Record<ResolvedEncoder, string> = {
  cpu: 'x264 (CPU)',
  nvenc: 'NVENC (NVIDIA GPU)',
  qsv: 'Quick Sync (Intel GPU)',
  amf: 'AMF (AMD GPU)',
};

function videoCodecArgs(enc: ResolvedEncoder, q: Quality): string[] {
  switch (enc) {
    case 'nvenc': {
      const t: Record<Quality, [string, number]> = { fast: ['p4', 23], balanced: ['p5', 20], best: ['p7', 18] };
      const [preset, cq] = t[q];
      return ['-c:v', 'h264_nvenc', '-preset', preset, '-tune', 'hq', '-rc', 'vbr', '-cq', String(cq),
              '-b:v', '0', '-maxrate', '16M', '-bufsize', '32M', '-spatial-aq', '1', '-profile:v', 'high'];
    }
    case 'qsv': {
      const t: Record<Quality, number> = { fast: 23, balanced: 20, best: 18 };
      return ['-c:v', 'h264_qsv', '-global_quality', String(t[q]), '-profile:v', 'high'];
    }
    case 'amf': {
      const t: Record<Quality, number> = { fast: 23, balanced: 20, best: 18 };
      return ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(t[q]),
              '-qp_p', String(t[q] + 2), '-profile:v', 'high'];
    }
    default: {
      const t: Record<Quality, [string, number]> = { fast: ['veryfast', 21], balanced: ['medium', 18], best: ['slow', 16] };
      const [preset, crf] = t[q];
      return ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high',
              '-maxrate', '16M', '-bufsize', '32M'];
    }
  }
}

// ---------------------------------------------------------------- formats
function formatArgs(f: FormatKey): string[] {
  const sharp = 'unsharp=5:5:0.4:5:5:0.0';
  switch (f) {
    case 'crop':
      return ['-vf', `crop=trunc(ih*9/16/2)*2:ih,scale=1080:1920:flags=lanczos+accurate_rnd,${sharp},setsar=1,format=yuv420p`];
    case 'square':
      return ['-vf', `crop=ih:ih,scale=1080:1080:flags=lanczos+accurate_rnd,${sharp},setsar=1,format=yuv420p`];
    case 'blur': {
      // Background is blurred at 1/8 size and scaled up: smoother look and far faster to render.
      const fc =
        '[0:v]split=2[bg][fg];' +
        '[bg]scale=135:240:force_original_aspect_ratio=increase,crop=135:240,gblur=sigma=3,' +
        'scale=1080:1920:flags=bicubic,eq=brightness=-0.08:saturation=1.15[b];' +
        `[fg]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos+accurate_rnd,${sharp}[f];` +
        '[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]';
      return ['-filter_complex', fc, '-map', '[v]', '-map', '0:a:0?'];
    }
    default:
      return ['-pix_fmt', 'yuv420p'];
  }
}

// ---------------------------------------------------------------- full command
export interface BuildOpts {
  input: string;
  output: string;
  start: number;
  dur: number;
  format: FormatKey;
  encoder: ResolvedEncoder;
  quality: Quality;
  normalize: boolean;
  hasAudio: boolean;
}

const num = (x: number) => String(Math.round(x * 1000) / 1000);

export function buildArgs(o: BuildOpts): string[] {
  const a: string[] = [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-progress', 'pipe:1',
    '-ss', num(o.start), '-i', o.input, '-t', num(o.dur), // -ss before -i = instant seek, still frame-accurate
    ...formatArgs(o.format),
    ...videoCodecArgs(o.encoder, o.quality),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  ];
  if (o.hasAudio) {
    let af = `afade=t=in:st=0:d=0.04,afade=t=out:st=${num(Math.max(0, o.dur - 0.05))}:d=0.05`;
    if (o.normalize) af = `loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,${af}`;
    a.push('-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
  } else {
    a.push('-an');
  }
  a.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', '-f', 'mp4', o.output);
  return a;
}
