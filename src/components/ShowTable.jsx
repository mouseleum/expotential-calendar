import { formatDateRange } from '../utils/dateUtils';

const FLAG_GLYPH = { interested: '★', attending: '✓', skip: '✕' };

export function ShowTable({ shows, sort, setSort, flags, onFlag }) {
  function header(key, label, align = 'left') {
    const active = sort.key === key;
    const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
    return (
      <th
        style={{ textAlign: align }}
        onClick={() => setSort((prev) => ({
          key,
          dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
        }))}
      >
        {label}
        {active && <span className="sort-arrow">{arrow}</span>}
      </th>
    );
  }

  if (shows.length === 0) {
    return <div className="empty">No shows match the current filters.</div>;
  }

  return (
    <div className="show-table-wrap">
      <table className="show-table">
        <thead>
          <tr>
            <th className="col-flag">⚑</th>
            {header('start_date', 'Dates')}
            {header('name', 'Show')}
            {header('city', 'City')}
            {header('country', 'Country')}
            {header('attendees', 'Attendees', 'right')}
            {header('exhibitors', 'Exhibitors', 'right')}
          </tr>
        </thead>
        <tbody>
          {shows.map((s) => {
            const flag = flags[s.id];
            return (
              <tr key={s.id}>
                <td className="col-flag">
                  <button
                    className="flag-btn"
                    data-state={flag || ''}
                    onClick={() => onFlag(s.id)}
                    title={flag ? `Flagged: ${flag}` : 'Flag this show'}
                  >
                    {flag ? FLAG_GLYPH[flag] : '·'}
                  </button>
                </td>
                <td className="col-dates">{formatDateRange(s.start_date, s.end_date)}</td>
                <td className="col-name">
                  {s.website
                    ? <a href={s.website} target="_blank" rel="noopener noreferrer">{s.name}</a>
                    : s.name}
                </td>
                <td>{s.city || '—'}</td>
                <td>{s.country}</td>
                <td className="col-num">{s.attendees != null ? s.attendees.toLocaleString() : '—'}</td>
                <td className="col-num">{s.exhibitors != null ? s.exhibitors.toLocaleString() : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
