import { describe, it, expect } from 'vitest';
import {
  stripDiacritics, normalizeVenue, urlToDomain,
  s2lTokens, prepareScan2Lead, matchesScan2Lead,
} from '../scripts/lib/normalize.js';
import { slugify } from '../scripts/lib/slugify.js';

describe('stripDiacritics', () => {
  it('strips NFD-decomposable accents', () => {
    expect(stripDiacritics('Düsseldorf Männer château')).toBe('Dusseldorf Manner chateau');
  });
  it('handles Nordic letters and ß that do not decompose', () => {
    expect(stripDiacritics('Øst Æble Århus Þing ß')).toBe('Ost Aeble Arhus Thing ss');
  });
});

describe('normalizeVenue', () => {
  it('strips a trailing city that matches the show city (diacritic-aware)', () => {
    expect(normalizeVenue('Messe München, München', 'Munchen', {})).toBe('Messe München');
  });
  it('strips a trailing single capitalized word (eventseye habit)', () => {
    expect(normalizeVenue('Fiera Milano, Rho', 'Milan', {})).toBe('Fiera Milano');
  });
  it('keeps venue-noun suffixes like Expo/Centre', () => {
    expect(normalizeVenue('Brussels Kart, Expo', 'Brussels', {})).toBe('Brussels Kart, Expo');
  });
  it('applies aliases after stripping', () => {
    expect(normalizeVenue('messe muenchen', null, { 'messe muenchen': 'Messe Munich' })).toBe('Messe Munich');
  });
  it('returns null for empty input', () => {
    expect(normalizeVenue(null, 'Berlin', {})).toBe(null);
  });
});

describe('urlToDomain', () => {
  it('extracts a bare domain and drops www', () => {
    expect(urlToDomain('https://www.messe-muenchen.de/en/fairs')).toBe('messe-muenchen.de');
  });
  it('keeps three labels for co.uk-style hosts', () => {
    expect(urlToDomain('https://shows.example.co.uk/x')).toBe('example.co.uk');
  });
  it('handles protocol-relative URLs', () => {
    expect(urlToDomain('//cdn.foo.com/asset')).toBe('foo.com');
  });
  it('returns null for garbage', () => {
    expect(urlToDomain('not a url')).toBe(null);
    expect(urlToDomain(null)).toBe(null);
  });
});

describe('scan2lead matching', () => {
  it('tokenizes with diacritics stripped and short tokens dropped', () => {
    expect([...s2lTokens('A+A Düsseldorf')]).toEqual(['dusseldorf']);
  });
  it('drops entries that reduce to a single generic token', () => {
    const prepared = prepareScan2Lead(['Festival', 'ISPO Munich']);
    expect(prepared.map((p) => p.name)).toEqual(['ISPO Munich']);
  });
  it('matches when every entry token appears in the show name', () => {
    const prepared = prepareScan2Lead(['ISPO Munich']);
    expect(matchesScan2Lead('ISPO Munich 2026 — Sports Trade Fair', prepared)).toBe(true);
    expect(matchesScan2Lead('ISPO Shanghai 2026', prepared)).toBe(false);
  });
});

describe('slugify', () => {
  it('lowercases, strips accents, and converts & to and', () => {
    expect(slugify('Wine & Food — München!')).toBe('wine-and-food-munchen');
  });
  it('handles empty input', () => {
    expect(slugify(null)).toBe('');
  });
});
