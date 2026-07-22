import { describe, it, expect } from 'vitest';
import { filtersToJSON, filtersFromJSON } from '../src/utils/filterSerialize.js';

const FULL = {
  countries: new Set(['Germany', 'France']),
  venues: new Set(['Messe Munich']),
  industries: new Set(),
  audiences: new Set(['b2b']),
  sources: new Set(),
  query: 'solar',
  minAttendees: '500',
  dateFrom: '2026-07',
  dateTo: '',
  week: '',
  weekYear: '',
  flaggedOnly: true,
  scan2leadOnly: false,
  majorCitiesOnly: false,
};

describe('filter serialization', () => {
  it('round-trips a full filter object', () => {
    const back = filtersFromJSON(JSON.parse(JSON.stringify(filtersToJSON(FULL))));
    expect(back).toEqual(FULL);
  });

  it.each([undefined, null, {}, [], 'junk'])('produces valid state from %j', (bad) => {
    const f = filtersFromJSON(bad);
    expect(f.countries).toBeInstanceOf(Set);
    expect(typeof f.query).toBe('string');
    expect(typeof f.flaggedOnly).toBe('boolean');
    // The exact expression App.jsx runs on every render must not throw
    expect(() => f.query.trim().toLowerCase()).not.toThrow();
  });

  it('coerces wrong-typed fields instead of crashing', () => {
    const f = filtersFromJSON({ countries: 'Germany', query: 42, flaggedOnly: 'yes', week: 12 });
    expect(f.countries.size).toBe(0);
    expect(f.query).toBe('42');
    expect(f.flaggedOnly).toBe(false);
    expect(f.week).toBe('12');
  });

  it('drops non-string members from set fields', () => {
    const f = filtersFromJSON({ countries: ['Germany', 5, null, 'France'] });
    expect([...f.countries]).toEqual(['Germany', 'France']);
  });
});
