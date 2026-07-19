import { useMemo, useState } from 'react';
import { monthWeeks, layoutWeek, addDays } from '../utils/calendarLayout';
import { getISOWeek, formatDateRange } from '../utils/dateUtils';
import { INDUSTRY_SEGMENTS, INDUSTRY_COLORS } from '../utils/industries';

const SEGMENT_SET = new Set(INDUSTRY_SEGMENTS);
const FLAG_GLYPH = { interested: '★', attending: '✓', skip: '✕' };
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LANE_HEIGHT = 20;
const MAX_LANES = 6;

function ym(dateStr) {
  return { year: +dateStr.slice(0, 4), month: +dateStr.slice(5, 7) };
}

function monthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1))
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function barBorderColor(show) {
  const seg = (show.industry || []).find((t) => SEGMENT_SET.has(t));
  return (seg && INDUSTRY_COLORS[seg]?.border) || 'var(--border-strong)';
}

// `initialMonth` is 'YYYY-MM' (or ''); onWeekSelect(year, week) jumps to the
// table view filtered to that ISO week.
export function CalendarView({ shows, flags, initialMonth, onWeekSelect }) {
  const [{ year, month }, setMonth] = useState(() =>
    ym((initialMonth && `${initialMonth}-01`) || new Date().toISOString().slice(0, 10)));

  function step(delta) {
    setMonth(({ year, month }) => {
      const d = new Date(Date.UTC(year, month - 1 + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    });
  }
  function goToday() {
    setMonth(ym(new Date().toISOString().slice(0, 10)));
  }

  const weeks = useMemo(() => {
    return monthWeeks(year, month).map((weekStart) => ({
      weekStart,
      days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
      ...layoutWeek(shows, weekStart, MAX_LANES),
    }));
  }, [shows, year, month]);

  const thisMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="calendar">
      <div className="calendar__nav">
        <button onClick={() => step(-1)}>‹ prev</button>
        <button onClick={goToday}>today</button>
        <button onClick={() => step(1)}>next ›</button>
        <span className="calendar__month">{monthLabel(year, month)}</span>
      </div>
      <div className="calendar__dow">
        {DAY_LABELS.map((d) => <div key={d}>{d}</div>)}
      </div>
      {weeks.map(({ weekStart, days, placed, overflow }) => {
        const lanesUsed = placed.length ? Math.max(...placed.map((p) => p.lane)) + 1 : 0;
        const iso = getISOWeek(new Date(`${weekStart}T00:00:00Z`));
        return (
          <div
            key={weekStart}
            className="calendar__week"
            style={{ height: 24 + lanesUsed * LANE_HEIGHT + (overflow > 0 ? 18 : 0) }}
          >
            {days.map((day, i) => (
              <div
                key={day}
                className={'calendar__day' + (day === today ? ' calendar__day--today' : '')}
                style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
              >
                <span className={day.startsWith(thisMonthPrefix) ? '' : 'calendar__day-num--dim'}>
                  {+day.slice(8, 10)}
                </span>
              </div>
            ))}
            {placed.map(({ show, col, span, lane }) => {
              const flag = flags[show.id]?.state;
              return (
                <div
                  key={show.id}
                  className="calendar__bar"
                  style={{
                    left: `calc(${(col / 7) * 100}% + 2px)`,
                    width: `calc(${(span / 7) * 100}% - 4px)`,
                    top: 24 + lane * LANE_HEIGHT,
                    borderLeft: `3px solid ${barBorderColor(show)}`,
                  }}
                  title={`${show.name}\n${formatDateRange(show.start_date, show.end_date)}${show.venue ? `\n${show.venue}` : ''}${show.city ? `\n${show.city}, ${show.country}` : ''}`}
                  onClick={() => { if (show.website) window.open(show.website, '_blank', 'noopener,noreferrer'); }}
                  data-clickable={!!show.website}
                >
                  {flag && <span className="calendar__bar-flag" data-state={flag}>{FLAG_GLYPH[flag]} </span>}
                  {show.name}
                </div>
              );
            })}
            {overflow > 0 && (
              <button
                className="calendar__more"
                onClick={() => onWeekSelect(iso.year, iso.week)}
                title="Show this week in the table"
              >
                +{overflow} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
