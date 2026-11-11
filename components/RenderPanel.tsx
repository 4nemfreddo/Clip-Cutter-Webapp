'use client';

import type { EncoderKey, FormatKey, Quality, Settings, SystemInfo } from '@/lib/types';

const FORMATS: { key: FormatKey; title: string; sub: string; ratio: string }[] = [
  { key: 'original', title: 'Original', sub: 'Keep as is', ratio: '16 / 9' },
  { key: 'blur', title: 'Vertical blur', sub: '9:16 · blurred fill', ratio: '9 / 16' },
  { key: 'crop', title: 'Vertical crop', sub: '9:16 · centre crop', ratio: '9 / 16' },
  { key: 'square', title: 'Square', sub: '1:1', ratio: '1 / 1' },
];

const QUALITIES: { key: Quality; title: string; sub: string }[] = [
  { key: 'fast', title: 'Fast', sub: 'draft' },
  { key: 'balanced', title: 'Balanced', sub: 'recommended' },
  { key: 'best', title: 'Best', sub: 'slowest' },
];

const ENCODER_NAMES: Record<EncoderKey, string> = {
  auto: 'Auto',
  cpu: 'CPU (x264)',
  nvenc: 'NVIDIA (NVENC)',
  qsv: 'Intel (Quick Sync)',
  amf: 'AMD (AMF)',
};

interface Props {
  settings: Settings;
  onChange(next: Settings): void;
  system: SystemInfo | null;
  validClips: number;
  busy: boolean;
  onRender(): void;
}

export default function RenderPanel({ settings, onChange, system, validClips, busy, onRender }: Props) {
  const toggleFormat = (f: FormatKey) => {
    const has = settings.formats.includes(f);
    const next = has ? settings.formats.filter((x) => x !== f) : [...settings.formats, f];
    onChange({ ...settings, formats: next });
  };
  const files = validClips * settings.formats.length;
  const available = system?.encoders ?? ['cpu'];

  return (
    <div className="panel">
      <h2>Render</h2>

      <div className="fmts">
        {FORMATS.map((f) => (
          <button key={f.key} className={'fmt' + (settings.formats.includes(f.key) ? ' on' : '')} onClick={() => toggleFormat(f.key)}>
            <span className="glyph" style={{ aspectRatio: f.ratio }} />
            <span>
              <b>{f.title}</b>
              <small>{f.sub}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="field">
        <span>Quality</span>
        <div className="seg3">
          {QUALITIES.map((q) => (
            <button key={q.key} className={settings.quality === q.key ? 'on' : ''} onClick={() => onChange({ ...settings, quality: q.key })}>
              {q.title}
              <small>{q.sub}</small>
            </button>
          ))}
        </div>
      </div>

      <details className="adv">
        <summary>Advanced</summary>
        <div className="inner">
          <div className="two">
            <label className="field" style={{ margin: 0 }}>
              <span>Encoder</span>
              <select value={settings.encoder} onChange={(e) => onChange({ ...settings, encoder: e.target.value as EncoderKey })}>
                <option value="auto">Auto</option>
                {available.map((k) => (
                  <option key={k} value={k}>
                    {ENCODER_NAMES[k as EncoderKey] ?? k}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Clips at once</span>
              <select value={settings.jobs} onChange={(e) => onChange({ ...settings, jobs: Number(e.target.value) })}>
                <option value={0}>Auto</option>
                {[1, 2, 3, 4, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.normalize} onChange={(e) => onChange({ ...settings, normalize: e.target.checked })} />
            Normalise loudness to −14 LUFS
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.skipExisting} onChange={(e) => onChange({ ...settings, skipExisting: e.target.checked })} />
            Skip clips that are already rendered
          </label>
          <div className="hint">
            Auto uses x264 on the CPU for the best quality per MB, and a GPU only when quality is set to Fast.
          </div>
        </div>
      </details>

      <div style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={onRender} disabled={busy || files === 0}>
          {busy ? 'Rendering…' : files === 0 ? 'Add clips and pick a format' : `Render ${files} file${files === 1 ? '' : 's'}`}
        </button>
      </div>

      <div className="sysline">
        <span className={'pill' + (system && !system.ok ? ' bad' : '')} />
        {system === null
          ? 'Checking FFmpeg…'
          : system.ok
            ? `FFmpeg ready · ${system.encoders.map((e) => (e === 'cpu' ? 'CPU' : e.toUpperCase())).join(' + ')}`
            : 'FFmpeg not found. Set FFMPEG_PATH in .env.local'}
      </div>
    </div>
  );
}
