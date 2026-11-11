export type FormatKey = 'original' | 'blur' | 'crop' | 'square';
export type Quality = 'fast' | 'balanced' | 'best';
export type EncoderKey = 'auto' | 'cpu' | 'nvenc' | 'qsv' | 'amf';

export const FORMAT_FOLDERS: Record<FormatKey, string> = {
  original: 'original',
  blur: 'vertical-blur',
  crop: 'vertical-crop',
  square: 'square',
};

export interface ClipDraft {
  id: string;
  name: string;
  label: string;
  start: number;
  end: number;
}

export interface ClipInput {
  name: string;
  label?: string;
  start: number;
  end: number;
}

export interface RenderRequest {
  path: string;
  clips: ClipInput[];
  formats: FormatKey[];
  quality: Quality;
  encoder: EncoderKey;
  normalize: boolean;
  jobs: number;
  skipExisting: boolean;
}

export interface Settings {
  formats: FormatKey[];
  quality: Quality;
  encoder: EncoderKey;
  normalize: boolean;
  jobs: number;
  skipExisting: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  formats: ['original'],
  quality: 'balanced',
  encoder: 'auto',
  normalize: true,
  jobs: 0,
  skipExisting: false,
};

export interface ProbeInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string;
}

export interface SourceInfo extends ProbeInfo {
  path: string;
  name: string;
}

export interface SystemInfo {
  ok: boolean;
  version: string;
  ffmpegPath: string;
  encoders: string[];
  cores: number;
  videosDir: string;
  outputDir: string;
}

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';

export interface TaskState {
  id: string;
  name: string;
  format: FormatKey;
  start: number;
  dur: number;
  status: TaskStatus;
  progress: number;
  outPath: string;
  size?: number;
  seconds?: number;
  error?: string;
}

export interface JobState {
  id: string;
  source: string;
  status: 'running' | 'done' | 'cancelled';
  tasks: TaskState[];
  startedAt: number;
  finishedAt?: number;
  encoder: string;
  jobs: number;
  outDir: string;
}
