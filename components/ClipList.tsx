'use client';

import { useEffect, useRef, useState } from 'react';
import { clipsToText, fmt, parseClipText, parseTime, uid } from '@/lib/time';
import type { ClipDraft } from '@/lib/types';
import { clipColor } from './Player';

function TimeInput({ value, onCommit }: { value: number; onCommit(v: number): void }) {
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  const cancel = useRef(false);

  useEffect(() => {
    if (!editing) setText(fmt(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (cancel.current) {
      cancel.current = false;
      setText(fmt(value));
      return;
    }
    const v = parseTime(text);
    if (v == null) setText(fmt(value));
    else onCommit(v);
  };

  return (
    <input
      type="text"
      className="time"
      value={text}
      spellCheck={false}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

interface Props {
  clips: ClipDraft[];
  duration: number;
  onChange(next: ClipDraft[]): void;
  onPreview(start: number, end: number): void;
  getTime(): number;
  onSeek(t: number): void;
  notify(msg: string): void;
}

export default function ClipList({ clips, duration, onChange, onPreview, getTime, onSeek, notify }: Props) {
  const [paste, setPaste] = useState('');

  const patch = (id: string, p: Partial<ClipDraft>) => onChange(clips.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const clampT = (t: number) => Math.min(Math.max(0, t), duration);
  const total = clips.reduce((n, c) => n + Math.max(0, c.end - c.start), 0);

  const doImport = () => {
    const parsed = parseClipText(paste);
    if (parsed.length === 0) {
      notify('Nothing readable. Use lines like: 01  00:01:28  00:01:47');
      return;
    }
    const next = parsed.map((p) => ({ id: uid(), name: p.name, label: p.label, start: clampT(p.start), end: clampT(p.end) }));
    onChange([...clips, ...next]);
    setPaste('');
    notify(`Imported ${next.length} clip${next.length === 1 ? '' : 's'}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clipsToText(clips));
      notify('Copied as clips.txt format');
    } catch {
      notify('Copy failed: your browser blocked clipboard access');
    }
  };

  return (
    <div className="panel">
      <h2>
        Clips <span className="count">{clips.length} · {fmt(total)} total</span>
        <span className="right">
          <button className="btn sm ghost" onClick={copy} disabled={clips.length === 0}>
            Copy list
          </button>
          <button className="btn sm ghost danger" onClick={() => clips.length && confirm('Remove all clips?') && onChange([])} disabled={clips.length === 0}>
            Clear
          </button>
        </span>
      </h2>

      {clips.length === 0 ? (
        <div className="empty">
          <b>No clips yet.</b>
          <br />
          Play the video, press <kbd>I</kbd> at the start and <kbd>O</kbd> at the end, then <kbd>A</kbd> to add it.
        </div>
      ) : (
        <div className="clips">
          <div className="clip-head">
            <span />
            <span>Name</span>
            <span>Start</span>
            <span>End</span>
            <span>Len</span>
            <span />
          </div>
          {clips.map((c, i) => {
            const bad = !(c.end > c.start) || c.end > duration + 0.05;
            return (
              <div key={c.id} className={'clip' + (bad ? ' bad' : '')}>
                <span className="dot" style={{ background: clipColor(i) }} />
                <input
                  type="text"
                  value={c.name}
                  spellCheck={false}
                  onChange={(e) => patch(c.id, { name: e.target.value })}
                  title="File name of the clip"
                />
                <TimeInput value={c.start} onCommit={(v) => patch(c.id, { start: clampT(v) })} />
                <TimeInput value={c.end} onCommit={(v) => patch(c.id, { end: clampT(v) })} />
                <span className="dur">{fmt(Math.max(0, c.end - c.start))}</span>
                <span className="acts">
                  <button className="btn sm" onClick={() => onPreview(c.start, c.end)} title="Play this clip">
                    ▶
                  </button>
                  <button className="btn sm ghost" onClick={() => patch(c.id, { start: clampT(getTime()) })} title="Set start to playhead">
                    ⇤
                  </button>
                  <button className="btn sm ghost" onClick={() => patch(c.id, { end: clampT(getTime()) })} title="Set end to playhead">
                    ⇥
                  </button>
                  <button className="btn sm ghost" onClick={() => onSeek(c.start)} title="Jump to start">
                    ⌖
                  </button>
                  <button className="btn sm ghost danger" onClick={() => onChange(clips.filter((x) => x.id !== c.id))} title="Delete">
                    ✕
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <details className="io">
        <summary>Import from a clips.txt list</summary>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'01  00:01:28  00:01:47\n02  00:08:00  00:08:30  hook'}
          spellCheck={false}
        />
        <div className="row">
          <button className="btn sm" onClick={doImport} disabled={!paste.trim()}>
            Import
          </button>
          <span className="hint" style={{ alignSelf: 'center' }}>
            NAME START END [label] · same format as the PowerShell version
          </span>
        </div>
      </details>
    </div>
  );
}
