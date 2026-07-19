import { useEffect, useState } from 'react';
import { formatDateRange } from '../utils/dateUtils';

// "What's new" — renders /changelog.json (written by merge.js on each
// refresh). The header button shows a badge with the latest refresh's
// additions while it's fresh (< 8 days old); hidden entirely when the file
// doesn't exist (fresh deployments, local vite preview).

const FRESH_MS = 8 * 24 * 3600 * 1000;

function ShowLine({ s, onShowClick, children }) {
  return (
    <div className="changelog__row">
      <span className="changelog__name" onClick={() => onShowClick(s.name)} title="Find in table">
        {s.name}
      </span>
      <span className="changelog__meta">
        {[s.city, s.country].filter(Boolean).join(', ')}
      </span>
      {children}
    </div>
  );
}

export function ChangelogPanel({ onShowClick }) {
  const [log, setLog] = useState(null);
  const [open, setOpen] = useState(false);
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    fetch('/changelog.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.refreshes?.length) setLog(d.refreshes); })
      .catch(() => {});
  }, []);

  if (!log) return null;

  const latest = log[0];
  const fresh = loadedAt - new Date(`${latest.date}T00:00:00Z`).getTime() < FRESH_MS;
  const badge = fresh && latest.counts.added > 0 ? `+${latest.counts.added}` : null;

  function pick(name) {
    onShowClick(name);
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Changes from the recent data refreshes">
        what's new{badge && <span className="changelog__badge">{badge}</span>}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <span>What's new</span>
              <button onClick={() => setOpen(false)} style={{ border: 'none', fontSize: 16 }}>×</button>
            </div>
            <div className="modal__body">
              {log.map((entry) => (
                <div key={entry.date} className="changelog__entry">
                  <div className="changelog__date">
                    {entry.date} — +{entry.counts.added} new
                    · {entry.counts.changed} date change{entry.counts.changed === 1 ? '' : 's'}
                    · {entry.counts.removed} gone
                  </div>
                  {entry.changed.length > 0 && (
                    <div className="changelog__section">
                      <div className="changelog__section-title">Date changes</div>
                      {entry.changed.map((c) => (
                        <ShowLine key={c.id} s={c} onShowClick={pick}>
                          <span className="changelog__meta">
                            {formatDateRange(c.from.start, c.from.end)} → {formatDateRange(c.to.start, c.to.end)}
                          </span>
                        </ShowLine>
                      ))}
                    </div>
                  )}
                  {entry.added.length > 0 && (
                    <div className="changelog__section">
                      <div className="changelog__section-title">New shows</div>
                      {entry.added.map((s) => (
                        <ShowLine key={s.id} s={s} onShowClick={pick}>
                          <span className="changelog__meta">{formatDateRange(s.start_date, s.end_date)}</span>
                        </ShowLine>
                      ))}
                    </div>
                  )}
                  {entry.removed.length > 0 && (
                    <div className="changelog__section">
                      <div className="changelog__section-title">No longer listed</div>
                      {entry.removed.map((s) => (
                        <ShowLine key={s.id} s={s} onShowClick={pick}>
                          <span className="changelog__meta">{formatDateRange(s.start_date, s.end_date)}</span>
                        </ShowLine>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
