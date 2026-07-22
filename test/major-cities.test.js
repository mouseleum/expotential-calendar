import { describe, it, expect } from 'vitest';
import { cityKey, computeMajorCities, isMajorCity } from '../scripts/lib/major-cities.js';

function show(city, country) {
  return { city, country };
}

describe('cityKey', () => {
  it('strips a trailing US/Canada state or province code', () => {
    expect(cityKey('Las Vegas, NV')).toBe('las vegas');
    expect(cityKey('Ottawa, ON')).toBe('ottawa');
  });
  it('is diacritic- and case-insensitive', () => {
    expect(cityKey('MÜNCHEN')).toBe('munchen');
    expect(cityKey('Malmö')).toBe('malmo');
  });
  it('strips apostrophes and periods', () => {
    expect(cityKey("’s-Hertogenbosch")).toBe('s-hertogenbosch');
  });
  it('returns empty string for missing city', () => {
    expect(cityKey(null)).toBe('');
    expect(cityKey('')).toBe('');
  });
  it('leaves a bare city name (no suffix) unchanged apart from casing', () => {
    expect(cityKey('Paris')).toBe('paris');
  });
});

describe('computeMajorCities', () => {
  it('keeps every city when a country has fewer cities than topN', () => {
    const shows = [
      show('Stockholm', 'Sweden'), show('Malmo', 'Sweden'), show('Gothenburg', 'Sweden'),
    ];
    const majors = computeMajorCities(shows, { topN: 15, minShare: 0.015 });
    for (const s of shows) expect(isMajorCity(s, majors)).toBe(true);
  });

  it('drops the long tail of one-off cities in a noisy country', () => {
    const shows = [
      ...Array(50).fill(0).map(() => show('Las Vegas, NV', 'United States')),
      ...Array(40).fill(0).map(() => show('Orlando, FL', 'United States')),
      show('Tiny Town, KS', 'United States'), // single one-off show
    ];
    const majors = computeMajorCities(shows, { topN: 2, minShare: 0.5 });
    expect(isMajorCity(show('Las Vegas, NV', 'United States'), majors)).toBe(true);
    expect(isMajorCity(show('Orlando, FL', 'United States'), majors)).toBe(true);
    expect(isMajorCity(show('Tiny Town, KS', 'United States'), majors)).toBe(false);
  });

  it('qualifies a city via minShare even outside the topN cutoff', () => {
    // 10 cities each with 1 show, one with 5 — topN:3 would only keep 3 of
    // the 1-show cities unless minShare independently promotes the 5-show one.
    const shows = [
      ...Array(5).fill(0).map(() => show('Big Hub', 'Testland')),
      ...Array(10).fill(0).map((_, i) => show(`Town${i}`, 'Testland')),
    ];
    const majors = computeMajorCities(shows, { topN: 3, minShare: 0.2 });
    expect(isMajorCity(show('Big Hub', 'Testland'), majors)).toBe(true);
  });

  it('keeps countries independent — a city name matching in two countries is judged separately', () => {
    const shows = [
      ...Array(20).fill(0).map(() => show('Springfield', 'CountryA')),
      show('Springfield', 'CountryB'), // one-off in a country with only this city
    ];
    const majors = computeMajorCities(shows, { topN: 1, minShare: 0.5 });
    expect(isMajorCity(show('Springfield', 'CountryA'), majors)).toBe(true);
    expect(isMajorCity(show('Springfield', 'CountryB'), majors)).toBe(true);
  });

  it('treats city-string variants (with/without state suffix) as the same city', () => {
    const shows = [
      ...Array(3).fill(0).map(() => show('Las Vegas, NV', 'United States')),
      ...Array(3).fill(0).map(() => show('Las Vegas', 'United States')),
    ];
    const majors = computeMajorCities(shows, { topN: 1, minShare: 1 });
    expect(isMajorCity(show('Las Vegas', 'United States'), majors)).toBe(true);
    expect(isMajorCity(show('Las Vegas, NV', 'United States'), majors)).toBe(true);
  });

  it('ignores shows with no city or country', () => {
    const majors = computeMajorCities([show(null, 'X'), show('Y', null)]);
    expect(majors.size).toBe(0);
  });
});

describe('isMajorCity', () => {
  it('returns false for a show with no country', () => {
    expect(isMajorCity(show('Paris', null), new Set(['France||paris']))).toBe(false);
  });
});
