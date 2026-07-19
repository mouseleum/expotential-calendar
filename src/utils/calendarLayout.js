// Pure date/layout helpers for the calendar month view. All dates are
// 'YYYY-MM-DD' strings compared/advanced in UTC (same convention as
// dateUtils.js).

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

// Mondays of every ISO week that touches the given month (1-12).
export function monthWeeks(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay() || 7; // 1=Mon … 7=Sun
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const weeks = [];
  let ws = addDays(first, -(dow - 1));
  while (ws <= lastDay) {
    weeks.push(ws);
    ws = addDays(ws, 7);
  }
  return weeks;
}

// Lay out the shows overlapping the week starting at `weekStart` (a Monday).
// Returns { placed: [{show, col, span, lane, clippedStart, clippedEnd}],
// overflow } where col is 0-6 (Mon-Sun), span is days within the week, and
// lanes are assigned greedily (earliest-starting, longest-first). Shows that
// don't fit in `maxLanes` lanes are counted in `overflow`.
export function layoutWeek(shows, weekStart, maxLanes = 6) {
  const weekEnd = addDays(weekStart, 6);
  const items = [];
  for (const show of shows) {
    if (!show.start_date) continue;
    const start = show.start_date;
    const end = show.end_date || show.start_date;
    if (end < weekStart || start > weekEnd) continue;
    const clippedStart = start < weekStart ? weekStart : start;
    const clippedEnd = end > weekEnd ? weekEnd : end;
    items.push({
      show,
      col: diffDays(weekStart, clippedStart),
      span: diffDays(clippedStart, clippedEnd) + 1,
      clippedStart,
      clippedEnd,
    });
  }
  items.sort((a, b) =>
    a.col - b.col || b.span - a.span || a.show.name.localeCompare(b.show.name));

  const laneEnds = []; // last occupied col per lane
  const placed = [];
  let overflow = 0;
  for (const item of items) {
    let lane = laneEnds.findIndex((endCol) => endCol < item.col);
    if (lane === -1) {
      if (laneEnds.length >= maxLanes) { overflow++; continue; }
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = item.col + item.span - 1;
    placed.push({ ...item, lane });
  }
  return { placed, overflow };
}
