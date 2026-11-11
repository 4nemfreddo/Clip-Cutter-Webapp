'use client';

import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from 'react';
import { fmt } from '@/lib/time';
import type { ClipDraft } from '@/lib/types';

export interface PlayerHandle {
  getTime(): number;
  seek(t: number): void;
  toggle(): void;
  step(frames: number): void;
  preview(start: number, end: number): void;
}

interface Props {
  ref?: Ref<PlayerHandle>;
  src: string;
  duration: number;
  fps: number;
  clips: ClipDraft[];
  inPoint: number | null;
  outPoint: number | null;
  onMarkIn(): void;
  onMarkOut(): void;
  onAdd(): void;
}

export const clipColor = (i: number) => `hsl(${(i * 47 + 220) % 360} 70% 62%)`;

export default function Player({ ref, src, duration, fps, clips, inPoint, outPoint, onMarkIn, onMarkOut, onAdd }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const range = useRef<{ end: number } | null>(null);
  const [time, setTime] = useState(0);
  const [error, setError] = useState(false);

  const clamp = (t: number) => Math.min(Math.max(0, t), duration || Infinity);

  const stepFrames = (frames: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = clamp(v.currentTime + frames / (fps || 30));
  };

  useImperativeHandle(
    ref,
    () => ({
      getTime: () => video.current?.currentTime ?? 0,
      seek: (t) => {
        if (video.current) video.current.currentTime = clamp(t);
      },
      toggle: () => {
        const v = video.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
      },
      step: (frames) => stepFrames(frames),
      preview: (start, end) => {
        const v = video.current;
        if (!v) return;
        range.current = { end };
        v.currentTime = clamp(start);
        void v.play();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duration, fps],
  );

  // Smooth playhead, and stop precisely where a previewed clip ends.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        setTime(v.currentTime);
        const r = range.current;
        if (r && v.currentTime >= r.end) {
          v.pause();
          v.currentTime = r.end;
          range.current = null;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => setError(false), [src]);

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const el = bar.current;
    const v = video.current;
    if (!el || !v || !duration) return;
    const r = el.getBoundingClientRect();
    range.current = null;
    v.currentTime = clamp(((e.clientX - r.left) / r.width) * duration);
  };

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / (duration || 1)) * 100))}%`;

  return (
    <div className="player">
      <div className="vwrap">
        <video
          ref={video}
          src={src}
          controls
          preload="metadata"
          playsInline
          onError={() => setError(true)}
          onPause={() => (range.current = null)}
        />
        {error && (
          <div className="verr warnbox">
            Your browser can’t preview this file (usually a codec like HEVC or MKV). You can still cut it: type the
            times in the list below and render as normal.
          </div>
        )}
      </div>

      <div
        ref={bar}
        className="timeline"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromPointer(e);
        }}
        title="Click or drag to seek"
      >
        {clips.map((c, i) => (
          <div
            key={c.id}
            className="seg"
            style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, background: clipColor(i) }}
            title={`${c.name}  ${fmt(c.start)} – ${fmt(c.end)}`}
          />
        ))}
        {inPoint != null && outPoint != null && outPoint > inPoint && (
          <div className="seg pending" style={{ left: pct(inPoint), width: `calc(${pct(outPoint)} - ${pct(inPoint)})` }} />
        )}
        {inPoint != null && <div className="mark" style={{ left: pct(inPoint) }} />}
        {outPoint != null && <div className="mark" style={{ left: pct(outPoint) }} />}
        <div className="head" style={{ left: pct(time) }} />
      </div>

      <div className="controls">
        <button className="btn sm" onClick={() => stepFrames(-1)} title="Back one frame ( , )">
          ◀︎ 1f
        </button>
        <button className="btn sm" onClick={() => stepFrames(1)} title="Forward one frame ( . )">
          1f ▶︎
        </button>
        <span className="readout">
          <b>{fmt(time)}</b> / {fmt(duration)}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={onMarkIn}>
          Set start <kbd>I</kbd>
        </button>
        <button className="btn sm" onClick={onMarkOut}>
          Set end <kbd>O</kbd>
        </button>
        <button className="btn sm" onClick={onAdd} disabled={inPoint == null}>
          Add clip <kbd>A</kbd>
        </button>
      </div>
      <div className="controls">
        <span className="readout pt">
          <i /> start <b>{inPoint != null ? fmt(inPoint) : '—'}</b>
        </span>
        <span className="readout pt">
          <i /> end <b>{outPoint != null ? fmt(outPoint) : '—'}</b>
        </span>
        {inPoint != null && outPoint != null && outPoint > inPoint && (
          <span className="readout">
            length <b>{fmt(outPoint - inPoint)}</b>
          </span>
        )}
        <span className="spacer" />
        <span className="hint">
          <kbd>Space</kbd> play · <kbd>←</kbd>
          <kbd>→</kbd> ±1s · <kbd>,</kbd>
          <kbd>.</kbd> frame
        </span>
      </div>
    </div>
  );
}
