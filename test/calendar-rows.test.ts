import { describe, it, expect } from 'vitest';
import {
  normalizeName, countryCodeFor, parseSources, dateStatusFor, frequencyFor, organiserFor,
  baseSeriesKey, assignSeriesKeys, toCalendarRow,
} from '../scripts/lib/calendar-rows.ts';
import { ShowSchema, type Show } from '../src/types/show.ts';

const show = (over: Partial<Show>): Show => ShowSchema.parse({
  id: 'x', name: 'Test Expo', start_date: '2027-04-01', end_date: '2027-04-03',
  city: 'Stockholm', country: 'Sweden', country_code: 'SE', venue: null, industry: [],
  attendees: null, exhibitors: null, website: null, source: 'tradeshow_calendar',
  source_url: '', notes: '', ...over,
});

describe('normalizeName', () => {
  // Must stay identical to exporepoapi lib/normalize.ts.
  it('lowercases and drops everything but a-z0-9', () => {
    expect(normalizeName('CPHI Frankfurt 2027')).toBe('cphifrankfurt2027');
    expect(normalizeName('Elmia Subcontractor — Jönköping')).toBe('elmiasubcontractorjnkping');
  });
});

describe('countryCodeFor', () => {
  it('maps English names, including the aliases Intl misses', () => {
    expect(countryCodeFor('Germany')).toBe('DE');
    expect(countryCodeFor('United Kingdom')).toBe('GB');
    expect(countryCodeFor('France')).toBe('FR');
    expect(countryCodeFor('Turkey')).toBe('TR');
    expect(countryCodeFor('Czech Republic')).toBe('CZ');
    expect(countryCodeFor(null)).toBeNull();
    expect(countryCodeFor('Atlantis')).toBeNull();
  });
});

describe('source-derived fields', () => {
  it('splits sources and classifies date_status', () => {
    const s = parseSources('tradeshow_calendar+venue:eventseye');
    expect(s).toEqual(['tradeshow_calendar', 'venue:eventseye']);
    expect(dateStatusFor(s)).toBe('listing_only');
    expect(dateStatusFor(['venue:eventseye', 'venue:stockholmsmassan'])).toBe('confirmed');
    expect(dateStatusFor(['venue:informa'])).toBe('confirmed');
  });
  it('parses frequency and organiser from notes', () => {
    expect(frequencyFor('frequency: once a year')).toBe('annual');
    expect(frequencyFor('frequency: every 2 years')).toBe('biennial');
    expect(frequencyFor('frequency: every 3 years')).toBe('triennial');
    expect(frequencyFor('frequency: twice a year')).toBe('irregular');
    expect(frequencyFor('Informa Markets')).toBe('unknown');
    expect(organiserFor('Informa Markets', ['venue:informa'])).toBe('Informa Markets');
    expect(organiserFor('', ['venue:rx-events'])).toBe('RX');
    expect(organiserFor('', ['tradeshow_calendar'])).toBeNull();
  });
});

describe('assignSeriesKeys', () => {
  it('strips the year from the series key and takes edition_year from start_date', () => {
    expect(baseSeriesKey('ISE 2027')).toBe('ise');
    const { keyed, log } = assignSeriesKeys([show({ id: 'a', name: 'ISE 2027', start_date: '2027-02-09' })]);
    expect(keyed[0]).toMatchObject({ series_key: 'ise', edition_year: 2027 });
    expect(log).toEqual([]);
  });

  it('drops near-same-date duplicates and keeps the richer row', () => {
    const { keyed, log } = assignSeriesKeys([
      show({ id: 'thin', name: 'ISC East', city: 'New York City', start_date: '2026-11-03' }),
      show({ id: 'rich', name: 'ISC East', city: 'New York, NY', start_date: '2026-11-03', source: 'venue:eventseye+venue:rx-events' }),
    ]);
    expect(keyed.map((k) => k.show.id)).toEqual(['rich']);
    expect(log.map((l) => [l.reason, l.calendar_slug])).toEqual([['duplicate', 'thin']]);
  });

  it('suffixes the city for every year of a multi-city series', () => {
    const { keyed } = assignSeriesKeys([
      show({ id: 'sh27', name: 'S-Factory Expo', city: 'Shanghai', start_date: '2027-06-02' }),
      show({ id: 'sz27', name: 'S-Factory Expo', city: 'Shenzhen', start_date: '2027-10-27' }),
      show({ id: 'sh28', name: 'S-Factory Expo', city: 'Shanghai', start_date: '2028-06-01' }),
    ]);
    expect(keyed.map((k) => `${k.series_key}/${k.edition_year}`).sort()).toEqual([
      's-factory-expo-shanghai/2027', 's-factory-expo-shanghai/2028', 's-factory-expo-shenzhen/2027',
    ]);
  });

  it('splits twice-a-year same-city editions into h1/h2', () => {
    const { keyed, log } = assignSeriesKeys([
      show({ id: 'jan', name: 'Formex', start_date: '2027-01-19' }),
      show({ id: 'aug', name: 'Formex', start_date: '2027-08-24' }),
    ]);
    expect(keyed.map((k) => k.series_key).sort()).toEqual(['formex-stockholm-h1', 'formex-stockholm-h2']);
    expect(log.some((l) => l.reason === 'half_year_suffixed')).toBe(true);
  });

  it('skips and logs editions it cannot tell apart', () => {
    const { keyed, log } = assignSeriesKeys([
      show({ id: 'a', name: 'Market Days', start_date: '2027-02-08' }),
      show({ id: 'b', name: 'Market Days', start_date: '2027-06-28' }),
    ]);
    expect(keyed).toEqual([]);
    expect(log.filter((l) => l.reason === 'ambiguous')).toHaveLength(2);
  });

  it('keys are unique per (series_key, edition_year)', () => {
    const shows = ['Expo A', 'Expo A', 'Expo B'].map((name, i) =>
      show({ id: `s${i}`, name, city: ['Oslo', 'Bergen', 'Oslo'][i], start_date: `2027-0${i + 3}-01` }));
    const { keyed } = assignSeriesKeys(shows);
    const keys = keyed.map((k) => `${k.series_key}|${k.edition_year}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('toCalendarRow', () => {
  it('maps fields and fills a missing country_code', () => {
    const row = toCalendarRow({
      series_key: 'cphi-frankfurt', edition_year: 2027,
      show: show({
        id: 'cphi', name: 'CPHI Frankfurt', country: 'Germany', country_code: null, city: 'Frankfurt',
        industry: ['Medical & Pharma', 'Medical & Pharma'], exhibitors: 2500.4, notes: 'Informa Markets',
        source: 'venue:informa+tradeshow_calendar', source_url: 'https://www.cphi.com/europe/',
      }),
    });
    expect(row).toMatchObject({
      calendar_slug: 'cphi', name_normalized: 'cphifrankfurt', country_code: 'DE', country_name: 'Germany',
      industries: ['Medical & Pharma'], exhibitors_estimate: 2500, organiser: 'Informa Markets',
      date_status: 'confirmed', frequency: 'unknown', sources: ['venue:informa', 'tradeshow_calendar'],
      source_urls: { 'venue:informa': 'https://www.cphi.com/europe/' },
    });
  });
});
