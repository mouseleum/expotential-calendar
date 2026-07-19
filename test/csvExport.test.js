import { describe, it, expect } from 'vitest';
import { showsToCSV } from '../src/utils/csvExport.js';

describe('showsToCSV', () => {
  it('quotes fields containing commas, quotes, and newlines', () => {
    const csv = showsToCSV([{
      name: 'Wine, Beer & "Spirits"',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
      city: 'Line1\nLine2',
      country: 'France',
      country_code: 'FR',
      venue: null,
      attendees: 1200,
      exhibitors: null,
      website: 'https://example.com',
      source: 'manual',
    }]);
    const [header, row] = csv.split('\n', 2);
    expect(header).toBe('name,start_date,end_date,city,country,country_code,venue,attendees,exhibitors,website,source');
    expect(row.startsWith('"Wine, Beer & ""Spirits""",2026-05-01')).toBe(true);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('renders null/undefined as empty fields', () => {
    const csv = showsToCSV([{ name: 'X', start_date: '2026-01-01' }]);
    expect(csv.split('\n')[1]).toBe('X,2026-01-01,,,,,,,,,');
  });
});
