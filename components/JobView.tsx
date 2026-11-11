'use client';

import { fmt, fmtSize } from '@/lib/time';
import { FORMAT_FOLDERS, type JobState } from '@/lib/types';

const fileUrl = (p: string, download = false) => `/api/file?path=${encodeURIComponent(p)}${download ? '&download=1' : ''}`;

export default function JobView({ job, onCancel, onOpen }: { job: JobState; onCancel(): void; onOpen(): void }) {
  const total = job.tasks.reduce((n, t) => n + t.dur, 0) || 1;
  const done = job.tasks.reduce((n, t) => n + t.dur * (t.status === 'done' || t.status === 'skipped' ? 1 : t.progress), 0);
  const frac = Math.min(1, done / total);
  const finished = job.tasks.filter((t) => t.status === 'done' || t.status === 'skipped' || t.status === 'failed' || t.status === 'cancelled').length;
  const elapsed = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000;
  const eta = job.status === 'running' && frac > 0.02 ? (elapsed * (1 - frac)) / frac : null;
  const running = job.status === 'running';
  const ok = job.tasks.filter((t) => t.status === 'done' || t.status === 'skipped');
  const failed = job.tasks.filter((t) => t.status === 'failed');
  const bytes = ok.reduce((n, t) => n + (t.size ?? 0), 0);

  return (
    <div className="panel">
      <h2>
        {running ? 'Rendering' : job.status === 'cancelled' ? 'Cancelled' : 'Finished'}
        <span className="count">
          {job.encoder} · {job.jobs} at once
        </span>
      </h2>

      <div className="big">
        <i style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="jobmeta">
        <span>
          <b>{Math.round(frac * 100)}%</b> · {finished}/{job.tasks.length} files
        </span>
        <span>{running ? `ETA ${eta == null ? '--:--' : fmt(eta, false)}` : `took ${fmt(elapsed, false)}`}</span>
      </div>

      {!running && (
        <div className="stat">
          <div>
            <b style={{ color: 'var(--ok)' }}>{ok.length}</b>
            <span>rendered</span>
          </div>
          {failed.length > 0 && (
            <div>
              <b style={{ color: 'var(--bad)' }}>{failed.length}</b>
              <span>failed</span>
            </div>
          )}
          <div>
            <b>{fmtSize(bytes)}</b>
            <span>total size</span>
          </div>
        </div>
      )}

      <div className="tasks">
        {job.tasks.map((t) => (
          <div key={t.id} className={'task ' + t.status}>
            <span className="st" />
            <div>
              <div className="nm">
                {t.name}
                <small>{FORMAT_FOLDERS[t.format]} · {fmt(t.dur)}</small>
              </div>
              {t.status === 'running' && (
                <div className="mini">
                  <i style={{ width: `${t.progress * 100}%` }} />
                </div>
              )}
            </div>
            <div className="meta">
              {t.status === 'queued' && 'queued'}
              {t.status === 'running' && `${Math.round(t.progress * 100)}%`}
              {t.status === 'skipped' && 'already there'}
              {t.status === 'cancelled' && 'cancelled'}
              {t.status === 'failed' && 'failed'}
              {t.status === 'done' && (
                <>
                  {fmtSize(t.size ?? 0)}
                  <a href={fileUrl(t.outPath)} target="_blank" rel="noreferrer">
                    Play
                  </a>
                  <a href={fileUrl(t.outPath, true)}>Save</a>
                </>
              )}
            </div>
            {t.error && <div className="e">{t.error}</div>}
          </div>
        ))}
      </div>

      <div className="donebar">
        {running ? (
          <button className="btn danger" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className="btn" onClick={onOpen}>
            Open output folder
          </button>
        )}
      </div>
    </div>
  );
}
