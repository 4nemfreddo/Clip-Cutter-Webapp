import fs from 'node:fs';
import path from 'node:path';

export const VIDEOS_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.VIDEOS_DIR || './videos');
export const OUTPUT_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.OUTPUT_DIR || './clips');

export function ffmpegPath(): string {
  const p = process.env.FFMPEG_PATH?.trim();
  if (p && fs.existsSync(p)) return p;
  return 'ffmpeg';
}

export function ffprobePath(): string {
  const p = ffmpegPath();
  if (p !== 'ffmpeg') {
    const cand = path.join(path.dirname(p), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fs.existsSync(cand)) return cand;
  }
  return 'ffprobe';
}
