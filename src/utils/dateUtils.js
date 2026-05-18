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
