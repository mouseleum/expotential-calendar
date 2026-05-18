export function formatDateRange(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sameYear = e && s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  const monthShort = (d) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = (d) => d.getUTCDate();
  const year = (d) => d.getUTCFullYear();

  if (!e || start === end) return `${monthShort(s)} ${day(s)}, ${year(s)}`;
  if (sameMonth) return `${monthShort(s)} ${day(s)}–${day(e)}, ${year(s)}`;
  if (sameYear) return `${monthShort(s)} ${day(s)} – ${monthShort(e)} ${day(e)}, ${year(s)}`;
  return `${monthShort(s)} ${day(s)}, ${year(s)} – ${monthShort(e)} ${day(e)}, ${year(e)}`;
}

// Accepts YYYY-MM-DD or YYYY-MM (month). Month is expanded to the start of
// month for the "from" bound and end of month for the "to" bound.
function normalizeBound(v, kind) {
  if (!v) return null;
  if (v.length === 7) return kind === 'from' ? `${v}-01` : `${v}-31`;
  return v;
}

export function isInDateRange(showStart, showEnd, filterStart, filterEnd) {
  if (!showStart) return false;
  const fStart = normalizeBound(filterStart, 'from');
  const fEnd = normalizeBound(filterEnd, 'to');
  if (fStart && showEnd && showEnd < fStart) return false;
  if (fEnd && showStart > fEnd) return false;
  return true;
}

export function isInMonth(showStart, year, month) {
  if (!showStart) return false;
  const d = new Date(showStart);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month;
}

// ISO 8601 week number: weeks start Monday, week 1 contains the first Thursday.
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

// First Monday of ISO week N of year Y, in UTC.
function isoWeekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

// True if [showStart, showEnd] overlaps with ISO week `week` of `year`.
export function isInISOWeek(showStart, showEnd, year, week) {
  if (!showStart || !year || !week) return false;
  const wkStart = isoWeekStart(year, week);
  const wkEnd = new Date(wkStart);
  wkEnd.setUTCDate(wkStart.getUTCDate() + 6);
  const s = new Date(showStart);
  const e = showEnd ? new Date(showEnd) : s;
  return e >= wkStart && s <= wkEnd;
}
