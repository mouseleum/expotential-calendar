function escape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function showsToCSV(shows) {
  const headers = [
    'name', 'start_date', 'end_date', 'city', 'country', 'country_code',
    'venue', 'attendees', 'exhibitors', 'website', 'source',
  ];
  const lines = [headers.join(',')];
  for (const s of shows) {
    lines.push(headers.map((h) => escape(s[h])).join(','));
  }
  return lines.join('\n');
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
