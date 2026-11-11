'use client';

import { useEffect, useState } from 'react';
import { fmtSize } from '@/lib/time';

interface Item {
  name: string;
  path: string;
  size: number;
}

export default function SourcePicker({ onPick, loading, error }: { onPick(path: string): void; loading: boolean; error: string | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [dir, setDir] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    fetch('/api/videos')
      .then((r) => r.json())
      .then((d: { dir: string; items: Item[] }) => {
        setItems(d.items ?? []);
        setDir(d.dir ?? '');
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="picker">
      <div className="hero">
        <h1>
          Cut clips <span>fast</span>. Locally.
        </h1>
        <p>
          Pick a video, mark the moments you want, and render social-ready clips with FFmpeg. Nothing is uploaded
          anywhere. Everything runs on your machine.
        </p>
      </div>

      <div className="panel">
        <h2>Videos in your folder</h2>
        {items === null ? (
          <div className="hint">Looking…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            No videos found yet.
            <br />
            Drop a file into <span className="mono">{dir || './videos'}</span> and refresh, or paste a full path below.
          </div>
        ) : (
          <div className="vlist">
            {items.map((v) => (
              <button key={v.path} className="vitem" disabled={loading} onClick={() => onPick(v.path)}>
                <span className="nm">{v.name}</span>
                <span className="sz">{fmtSize(v.size)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Or open any file by path</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onPick(manual.trim());
          }}
        >
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={'C:\\Users\\you\\Videos\\interview.mp4'}
            spellCheck={false}
          />
          <button className="btn" type="submit" disabled={loading || !manual.trim()}>
            {loading ? 'Opening…' : 'Open'}
          </button>
        </form>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Tip: in Windows Explorer, Shift + right-click a file → <b>Copy as path</b>, then paste it here.
        </p>
        {error && <p className="err" style={{ marginBottom: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
