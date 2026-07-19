import { describe, it, expect } from 'vitest';
import { filtersToParam, filtersFromParam } from '../src/utils/urlState.js';

const DEFAULTS = {
  countries: new Set(['Germany']),
  venues: new Set(),
  industries: new Set(),
  audiences: new Set(['b2b']),
  sources: new Set(),
  query: '',
  minAttendees: '',
  dateFrom: '2026-07',
  dateTo: '',
  week: '',
  weekYear: '',
  flaggedOnly: false,
  scan2leadOnly: false,
};

describe('urlState', () => {
  it('round-trips filters incl. diacritics and commas in values', () => {
    const filters = {
      ...DEFAULTS,
      countries: new Set(['Germany', 'Türkiye']),
      venues: new Set(['Messe München', 'Palais 5 and 6, Brussels Expo']),
      query: 'solar & wind',
      flaggedOnly: true,
    };
    const param = filtersToParam(filters, DEFAULTS);
    expect(param).not.toBe('');
    expect(param).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, no escaping needed
    expect(filtersFromParam(param)).toEqual(filters);
  });

  it('returns an empty param when filters equal the defaults', () => {
    expect(filtersToParam({ ...DEFAULTS }, DEFAULTS)).toBe('');
  });

  it('returns null for absent or garbage params', () => {
    expect(filtersFromParam(null)).toBe(null);
    expect(filtersFromParam('')).toBe(null);
    expect(filtersFromParam('not-base64!!!')).toBe(null);
    expect(filtersFromParam('bnVsbA')).toBe(null); // base64url of 'null'
  });

  it('hardens decoded values through filtersFromJSON', () => {
    // base64url of '{"query":42}' — wrong type must be coerced, not crash
    const param = btoa('{"query":42}').replace(/=+$/, '');
    const f = filtersFromParam(param);
    expect(f.query).toBe('42');
    expect(f.countries).toBeInstanceOf(Set);
  });
});
