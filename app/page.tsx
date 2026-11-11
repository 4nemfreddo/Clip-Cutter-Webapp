'use client';

import { useEffect, useRef, useState } from 'react';
import ClipList from '@/components/ClipList';
import JobView from '@/components/JobView';
import Player, { type PlayerHandle } from '@/components/Player';
import RenderPanel from '@/components/RenderPanel';
import SourcePicker from '@/components/SourcePicker';
import { uid } from '@/lib/time';
import { DEFAULT_SETTINGS, type ClipDraft, type JobState, type Settings, type SourceInfo, type SystemInfo } from '@/lib/types';

const clipsKey = (p: string) => `cc:clips:${p}`;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const player = useRef<PlayerHandle>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [source, setSource] = useState<SourceInfo | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [inPoint, setIn] = useState<number | null>(null);
  const [outPoint, setOut] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  // ---- first load: system info + saved settings
  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('cc:settings', {}) });
    setSettingsReady(true);
    fetch('/api/system')
      .then((r) => r.json())
      .then((s: SystemInfo) => setSystem(s))
      .catch(() => setSystem(null));
  }, []);

  useEffect(() => {
    if (settingsReady) localStorage.setItem('cc:settings', JSON.stringify(settings));
  }, [settings, settingsReady]);

  // ---- remember clips per video
  useEffect(() => {
    if (source) localStorage.setItem(clipsKey(source.path), JSON.stringify(clips));
  }, [clips, source]);

  // ---- live job progress (Server-Sent Events)
  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/stream?id=${jobId}`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as JobState & { error?: string };
      if (data.error) {
        notify(data.error);
        es.close();
        return;
      }
      setJob(data);
      if (data.status !== 'running') es.close();
    };
    return () => es.close();
  }, [jobId]);

  // ---- open a video
  const openSource = async (path: string) => {
    setOpening(true);
    setOpenError(null);
    try {
      const res = await fetch(`/api/probe?path=${encodeURIComponent(path)}`);
      const d = (await res.json()) as SourceInfo & { error?: string };
      if (!res.ok) throw new Error(d.error || 'Could not open that file');
      if (!(d.duration > 0)) throw new Error('Could not read the video length. Is the file complete?');
      setSource(d);
      setClips(load<ClipDraft[]>(clipsKey(d.path), []));
      setIn(null);
      setOut(null);
      setJob(null);
      setJobId(null);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : 'Could not open that file');
    } finally {
      setOpening(false);
    }
  };

  // ---- clip editing
  const addClip = (start: number, end: number) => {
    setClips((prev) => {
      const used = new Set(prev.map((c) => c.name));
      let n = prev.length + 1;
      let name = '';
      do {
        name = String(n).padStart(2, '0');
        n++;
      } while (used.has(name));
      return [...prev, { id: uid(), name, label: '', start, end }];
    });
  };

  const markIn = () => {
    const p = player.current;
    if (!p) return;
    const t = p.getTime();
    setIn(t);
    if (outPoint != null && outPoint <= t) setOut(null);
  };
  const markOut = () => {
    const p = player.current;
    if (p) setOut(p.getTime());
  };
  const addFromMarkers = () => {
    const p = player.current;
    if (!p) return;
    if (inPoint == null) return notify('Set a start point first (press I)');
    const end = outPoint ?? p.getTime();
    if (end - inPoint < 0.5) return notify('A clip needs to be at least 0.5 seconds long');
    addClip(inPoint, end);
    setIn(null);
    setOut(null);
    notify('Clip added');
  };

  // ---- keyboard shortcuts (re-bound every render so they always see fresh state)
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const p = player.current;
      if (!p) return;
      const onVideo = t?.tagName === 'VIDEO';
      switch (e.key.toLowerCase()) {
        case 'i': e.preventDefault(); markIn(); break;
        case 'o': e.preventDefault(); markOut(); break;
        case 'a': e.preventDefault(); addFromMarkers(); break;
        case ' ': if (!onVideo) { e.preventDefault(); p.toggle(); } break;
        case 'arrowleft': if (!onVideo) { e.preventDefault(); p.seek(p.getTime() - (e.shiftKey ? 5 : 1)); } break;
        case 'arrowright': if (!onVideo) { e.preventDefault(); p.seek(p.getTime() + (e.shiftKey ? 5 : 1)); } break;
        case ',': p.step(-1); break;
        case '.': p.step(1); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- render
  const validClips = source ? clips.filter((c) => c.end > c.start && c.start < source.duration) : [];
  const running = job?.status === 'running';

  const startRender = async () => {
    if (!source) return;
    setStarting(true);
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: source.path,
          clips: validClips.map(({ name, label, start, end }) => ({ name, label, start, end })),
          ...settings,
        }),
      });
      const d = (await res.json()) as { id?: string; job?: JobState; error?: string };
      if (!res.ok || !d.id || !d.job) throw new Error(d.error || 'Could not start rendering');
      setJob(d.job);
      setJobId(d.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start rendering');
    } finally {
      setStarting(false);
    }
  };

  const cancel = () => {
    if (!jobId) return;
    void fetch('/api/jobs/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jobId }) });
  };

  const openFolder = () => {
    if (!job) return;
    void fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: job.outDir }) });
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="logo">✂</div>
        <div className="brand">
          Clip Cutter
          <small>local · FFmpeg-powered</small>
        </div>
        <span className="spacer" />
        {source && (
          <div className="chip-src">
            <b title={source.path}>{source.name}</b>
            <span>
              {source.width}×{source.height}
            </span>
            <button
              className="btn sm"
              onClick={() => {
                setSource(null);
                setJob(null);
                setJobId(null);
              }}
            >
              Change
            </button>
          </div>
        )}
      </header>

      {!source ? (
        <SourcePicker onPick={openSource} loading={opening} error={openError} />
      ) : (
        <div className="grid">
          <div className="stack">
            <div className="panel">
              <Player
                ref={player}
                src={`/api/stream?path=${encodeURIComponent(source.path)}`}
                duration={source.duration}
                fps={source.fps}
                clips={clips}
                inPoint={inPoint}
                outPoint={outPoint}
                onMarkIn={markIn}
                onMarkOut={markOut}
                onAdd={addFromMarkers}
              />
            </div>
            <ClipList
              clips={clips}
              duration={source.duration}
              onChange={setClips}
              onPreview={(s, e) => player.current?.preview(s, e)}
              getTime={() => player.current?.getTime() ?? 0}
              onSeek={(t) => player.current?.seek(t)}
              notify={notify}
            />
          </div>

          <aside className="stack sticky">
            <RenderPanel
              settings={settings}
              onChange={setSettings}
              system={system}
              validClips={validClips.length}
              busy={running || starting}
              onRender={startRender}
            />
            {job && <JobView job={job} onCancel={cancel} onOpen={openFolder} />}
          </aside>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
