// Client-safe time helpers.

export function fmt(sec: number, decimals = true): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.round(sec * 10) / 10;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 10);
  const ss = String(whole).padStart(2, '0') + (decimals && frac ? '.' + frac : '');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Accepts "1:28.5", "00:01:28", "88", "88.5". Returns null if it can't be read. */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3) return null;
  let sec = 0;
  for (const p of parts) {
    const v = p.trim();
    if (!/^\d+(\.\d+)?$/.test(v)) return null;
    sec = sec * 60 + parseFloat(v);
  }
  return sec;
}

export interface ParsedLine {
  name: string;
  label: string;
  start: number;
  end: number;
}

/** Parses the clips.txt format:  NAME START END [label...]   (# = comment) */
export function parseClipText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const tok = line.split(/[\s,]+/).filter(Boolean);
    if (tok.length < 3) continue;
    const start = parseTime(tok[1]);
    const end = parseTime(tok[2]);
    if (start == null || end == null || end <= start) continue;
    out.push({ name: tok[0], label: tok.slice(3).join('_'), start, end });
  }
  return out;
}

export function clipsToText(clips: { name: string; label: string; start: number; end: number }[]): string {
  const pad = (s: string) => s.padEnd(10);
  const rows = clips.map((c) => `${pad(c.name)}${pad(fmtFull(c.start))}${pad(fmtFull(c.end))}${c.label}`.trimEnd());
  return ['# NAME      START     END       [label]', ...rows].join('\n') + '\n';
}

export function fmtFull(sec: number): string {
  const total = Math.round(Math.max(0, sec) * 10) / 10;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(whole)}${frac ? '.' + frac : ''}`;
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
