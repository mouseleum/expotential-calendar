import { formatDateRange } from '../utils/dateUtils';
import { IndustryEditor } from './IndustryEditor';
import { INDUSTRY_SEGMENTS } from '../utils/industries';
import { useColumnWidths } from '../hooks/useColumnWidths';

const FLAG_GLYPH = { interested: '★', attending: '✓', skip: '✕' };
const INDUSTRY_CANON = new Set(INDUSTRY_SEGMENTS);

const DEFAULT_COL_WIDTHS = {
  flag: 40,
  dates: 130,
  name: 280,
  city: 130,
  country: 110,
  industry: 200,
  attendees: 90,
  exhibitors: 90,
};

// First canonical industry segment for sorting; empty string sorts last.
function industrySortKey(show) {
  if (!Array.isArray(show.industry)) return '';
  for (const t of show.industry) if (INDUSTRY_CANON.has(t)) return t;
  return '';
}

export function ShowTable({ shows, sort, setSort, flags, onFlag, industryOverrides, onIndustryChange }) {
  const { widths, startResize } = useColumnWidths(DEFAULT_COL_WIDTHS);

  function header(key, label, align = 'left') {
    const active = sort.key === key;
    const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
    return (
      <th
        style={{ textAlign: align, width: widths[key], position: 'relative' }}
        onClick={() => setSort((prev) => ({
          key,
          dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
        }))}
      >
        {label}
        {active && <span className="sort-arrow">{arrow}</span>}
        <span className="col-resize" onMouseDown={startResize(key)} />
      </th>
    );
  }

  if (shows.length === 0) {
    return <div className="empty">No shows match the current filters.</div>;
  }

  return (
    <div className="show-table-wrap">
      <table className="show-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className="col-flag" style={{ width: widths.flag }}>⚑</th>
            {header('start_date', 'Dates')}
            {header('name', 'Show')}
            {header('city', 'City')}
            {header('country', 'Country')}
            {header('industry', 'Industry')}
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
                <td>
                  {s.city || '—'}
                  {s.venue && (
                    <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 1 }}>{s.venue}</div>
                  )}
                </td>
                <td>{s.country}</td>
                <td>
                  <IndustryEditor
                    show={s}
                    overrides={industryOverrides}
                    onChange={onIndustryChange}
                  />
                </td>
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

export { industrySortKey };
