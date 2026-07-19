import { describe, it, expect } from 'vitest';
import { showsToICS } from '../src/utils/icsExport.js';

const NOW = new Date('2026-07-19T12:00:00Z');
const BASE = {
  id: 'test-show-berlin-2026-09',
  name: 'Test Show',
  city: 'Berlin',
  country: 'Germany',
  venue: 'Messe Berlin',
  start_date: '2026-09-01',
  end_date: '2026-09-03',
  website: 'https://example.com',
};

describe('showsToICS', () => {
  it('produces a valid skeleton with CRLF line endings', () => {
    const ics = showsToICS([BASE], NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:test-show-berlin-2026-09@expotential-calendar');
    expect(ics).toContain('DTSTAMP:20260719T120000Z');
  });

  it('makes the all-day DTEND exclusive (end date + 1)', () => {
    const ics = showsToICS([BASE], NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20260904');
  });

  it('rolls the exclusive end over month boundaries', () => {
    const ics = showsToICS([{ ...BASE, start_date: '2026-02-27', end_date: '2026-02-28' }], NOW);
    expect(ics).toContain('DTEND;VALUE=DATE:20260301');
  });

  it('treats a missing end_date as a one-day event', () => {
    const ics = showsToICS([{ ...BASE, end_date: null }], NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20260902');
  });

  it('escapes commas, semicolons, and backslashes in text fields', () => {
    const ics = showsToICS([{ ...BASE, name: 'Wine; Food, & \\Stuff' }], NOW);
    expect(ics).toContain('SUMMARY:Wine\\; Food\\, & \\\\Stuff');
    expect(ics).toContain('LOCATION:Messe Berlin\\, Berlin\\, Germany');
  });

  it('folds long lines at 75 octets with space continuations', () => {
    const ics = showsToICS([{ ...BASE, name: 'Ä'.repeat(100) }], NOW);
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toMatch(/\r\n [^\r\n]/); // at least one continuation line
    // Unfolding restores the full name (100 two-byte chars, escaped or not)
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${'Ä'.repeat(100)}`);
  });

  it('skips shows without a start date', () => {
    const ics = showsToICS([{ ...BASE, start_date: null }], NOW);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
