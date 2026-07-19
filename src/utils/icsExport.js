// iCalendar (RFC 5545) export of shows as all-day events.

// 'YYYY-MM-DD' → 'YYYYMMDD'
function icsDate(dateStr) {
  return dateStr.replaceAll('-', '');
}

// All-day DTEND is exclusive, so the event must end the day AFTER end_date.
function plusOneDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// TEXT escaping per RFC 5545 §3.3.11: backslash, semicolon, comma, newline.
function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Fold a content line at 75 octets (continuation lines start with a space).
// Counts octets, not chars — diacritics are multi-byte in UTF-8.
const encoder = new TextEncoder();
function foldLine(line) {
  const out = [];
  let current = '';
  let octets = 0;
  let limit = 75;
  for (const ch of line) {
    const len = encoder.encode(ch).length;
    if (octets + len > limit) {
      out.push(current);
      current = ' ';
      octets = 1;
      limit = 75;
    }
    current += ch;
    octets += len;
  }
  out.push(current);
  return out.join('\r\n');
}

// `now` is injectable so tests are deterministic (DTSTAMP is required).
export function showsToICS(shows, now = new Date()) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//expotential-calendar//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const s of shows) {
    if (!s.start_date) continue;
    const end = s.end_date || s.start_date;
    const location = [s.venue, s.city, s.country].filter(Boolean).join(', ');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${s.id}@expotential-calendar`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(s.start_date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(plusOneDay(end))}`);
    lines.push(`SUMMARY:${escapeText(s.name)}`);
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (s.website) lines.push(`URL:${escapeText(s.website)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
