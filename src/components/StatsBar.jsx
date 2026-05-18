import { useMemo } from 'react';
import { isInMonth } from '../utils/dateUtils';
import { showsToCSV, downloadCSV } from '../utils/csvExport';

export function StatsBar({ filtered, total, refreshedAt }) {
  const stats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getUTCFullYear();
    const thisMonth = now.getUTCMonth();
    const nextDate = new Date(Date.UTC(thisYear, thisMonth + 1, 1));
    const nextYear = nextDate.getUTCFullYear();
    const nextMonth = nextDate.getUTCMonth();
    return {
      countries: new Set(filtered.map((s) => s.country)).size,
      thisMonth: filtered.filter((s) => isInMonth(s.start_date, thisYear, thisMonth)).length,
      nextMonth: filtered.filter((s) => isInMonth(s.start_date, nextYear, nextMonth)).length,
    };
  }, [filtered]);

  const refreshedText = refreshedAt && refreshedAt !== '1970-01-01T00:00:00.000Z'
    ? new Date(refreshedAt).toISOString().slice(0, 10)
    : 'never';

  function handleExport() {
    const csv = showsToCSV(filtered);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`expotential-calendar-${date}.csv`, csv);
  }

  return (
    <div className="stats-bar">
      <div className="stats-bar__item">
        <span className="stats-bar__label">Shows</span>
        <span className="stats-bar__value">
          {filtered.length.toLocaleString()}
          {filtered.length !== total && (
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}> / {total.toLocaleString()}</span>
          )}
        </span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__label">Countries</span>
        <span className="stats-bar__value">{stats.countries}</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__label">This month</span>
        <span className="stats-bar__value">{stats.thisMonth}</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__label">Next month</span>
        <span className="stats-bar__value">{stats.nextMonth}</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__label">Last refresh</span>
        <span className="stats-bar__value" style={{ fontSize: 13 }}>{refreshedText}</span>
      </div>
      <div className="stats-bar__actions">
        <button onClick={handleExport} disabled={filtered.length === 0}>Export CSV</button>
      </div>
    </div>
  );
}
