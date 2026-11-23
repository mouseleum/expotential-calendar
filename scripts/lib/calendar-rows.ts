// Maps data/shows.json rows onto exporepoapi's calendar_shows table
// (db/migrations/0012_calendar_shows.sql). Pure functions only — no I/O — so
// the import script and the tests share one implementation.
import type { Show } from '../../src/types/show.ts';
import { slugify } from './slugify.js';

// ---------------------------------------------------------------------------
// Name normalisation. Deliberately identical to exporepoapi lib/normalize.ts
// (the rule behind companies.name_normalized and
// event_exhibitors.name_normalized). The repos can't import from each other;
// test/calendar-rows.test.ts pins the behaviour so the two stay in step.
// ---------------------------------------------------------------------------
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Country name → ISO 3166-1 alpha-2
// ---------------------------------------------------------------------------
// Codes Intl knows that aren't real ISO 3166-1 alpha-2 country codes.
const NOT_ISO = new Set(['UK', 'FX', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);
const COUNTRY_ALIASES: Record<string, string> = {
  turkey: 'TR',
  korea: 'KR',
  'south korea': 'KR',
  'czech republic': 'CZ',
  'cote divoire': 'CI',
  "cote d'ivoire": 'CI',
  'democratic republic of the congo': 'CD',
  myanmar: 'MM',
  usa: 'US',
  uk: 'GB',
  russia: 'RU',
};

let countryIndex: Map<string, string> | null = null;
function buildCountryIndex(): Map<string, string> {
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const idx = new Map<string, string>();
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of A) for (const b of A) {
    const code = a + b;
    if (NOT_ISO.has(code)) continue;
    let name: string | undefined;
    try {
      // Skip deprecated aliases (DD → DE, YU → RS, …): they share a display name.
      if (new Intl.Locale(`und-${code}`).region !== code) continue;
      name = dn.of(code);
    } catch { continue; }
    if (!name || name === code) continue;
    const key = name.toLowerCase();
    if (!idx.has(key)) idx.set(key, code);
  }
  for (const [k, v] of Object.entries(COUNTRY_ALIASES)) idx.set(k, v);
  return idx;
}

export function countryCodeFor(countryName: string | null): string | null {
  if (!countryName) return null;
  countryIndex ??= buildCountryIndex();
  return countryIndex.get(countryName.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Sources, date_status, frequency, organiser
// ---------------------------------------------------------------------------
// Sources that are the organiser's or the venue's own site → confirmed dates.
// Everything else (tradeshow_calendar, venue:eventseye, venue:expostands) is a
// third-party listing.
export const CONFIRMED_SOURCES = new Set([
  'venue:stockholmsmassan', 'venue:kistamassan', 'venue:malmomassan', 'venue:bellacenter',
  'venue:informa', 'venue:rx-events',
]);

export function parseSources(source: string): string[] {
  return source.split('+').map((s) => s.trim()).filter(Boolean);
}

export type DateStatus = 'confirmed' | 'listing_only' | 'tbc';
export function dateStatusFor(sources: string[]): DateStatus {
  return sources.some((s) => CONFIRMED_SOURCES.has(s)) ? 'confirmed' : 'listing_only';
}

export type Frequency = 'annual' | 'biennial' | 'triennial' | 'irregular' | 'unknown';
export function frequencyFor(notes: string): Frequency {
  const m = /frequency:\s*([^;|]+)/i.exec(notes);
  if (!m) return 'unknown';
  const f = m[1].trim().toLowerCase();
  if (f === 'once a year') return 'annual';
  if (f === 'every 2 years') return 'biennial';
  if (f === 'every 3 years') return 'triennial';
  if (f === 'unknown') return 'unknown';
  // "twice a year", "5 times a year", "every 4 years" …: no exact bucket; the
  // raw text stays in `notes`.
  return 'irregular';
}

export function organiserFor(notes: string, sources: string[]): string | null {
  if (/informa markets/i.test(notes) || sources.includes('venue:informa')) return 'Informa Markets';
  if (sources.includes('venue:rx-events')) return 'RX';
  return null;
}

// ---------------------------------------------------------------------------
// series_key + edition_year
// ---------------------------------------------------------------------------
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

export function baseSeriesKey(name: string): string {
  return slugify(name.replace(YEAR_RE, ' '));
}

function citySlug(city: string | null): string {
  return slugify((city ?? '').split(',')[0]);
}

export type LogReason =
  | 'duplicate'            // same series, same year, start dates ≤ DUP_DAYS apart: merge missed it
  | 'city_suffixed'        // series has several editions per year in different cities
  | 'half_year_suffixed'   // several editions a year in the same city: -h1 (Jan–Jun) / -h2 (Jul–Dec)
  | 'ambiguous'            // still collides after the city and half-year suffixes: skipped
  | 'name_year_mismatch'   // year in the name ≠ year of start_date (imported with start_date's year)
  | 'no_city';             // needed a city suffix but has no city

export interface LogEntry {
  reason: LogReason;
  calendar_slug: string;
  name: string;
  start_date: string;
  city: string | null;
  source: string;
  series_key: string | null;
  edition_year: number;
  detail: string;
}

export interface Keyed { show: Show; series_key: string; edition_year: number }

const DUP_DAYS = 3;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const richness = (s: Show) =>
  parseSources(s.source).length * 10 +
  [s.city, s.country_code, s.venue, s.website, s.exhibitors, s.attendees].filter((v) => v != null).length;

/**
 * Assigns (series_key, edition_year) to every show, so that the pair is unique.
 * Rules (agreed with Mikael, 23 Nov 2026):
 *  1. series_key = slug of the name with any year removed; edition_year = year of start_date.
 *  2. Same key + year, start dates within 3 days → a duplicate the merge missed: keep the row
 *     with the most sources/fields, skip and log the rest.
 *  3. Same key + year, different dates → the series runs several editions a year; every edition
 *     of that series (all years) gets the city appended, e.g. s-factory-expo-shanghai.
 *  4. Still colliding (twice a year in the same city, e.g. Formex Stockholm in January and
 *     August) → append -h1 (start Jan–Jun) or -h2 (Jul–Dec), for that year's editions.
 *  5. Anything still colliding is skipped and logged as ambiguous.
 * Every rule that changes a key or drops a row writes a log entry.
 */
export function assignSeriesKeys(shows: Show[]): { keyed: Keyed[]; log: LogEntry[] } {
  const log: LogEntry[] = [];
  const entry = (show: Show, reason: LogReason, series_key: string | null, detail: string): LogEntry => ({
    reason, calendar_slug: show.id, name: show.name, start_date: show.start_date, city: show.city,
    source: show.source, series_key, edition_year: Number(show.start_date.slice(0, 4)), detail,
  });

  const items = shows.map((show) => {
    const edition_year = Number(show.start_date.slice(0, 4));
    const nameYears = [...show.name.matchAll(YEAR_RE)].map((m) => Number(m[0]));
    if (nameYears.length && !nameYears.includes(edition_year)) {
      log.push(entry(show, 'name_year_mismatch', baseSeriesKey(show.name), `name says ${nameYears.join('/')}, start_date says ${edition_year}`));
    }
    return { show, base: baseSeriesKey(show.name), edition_year };
  });

  // Rule 2: drop near-same-date duplicates within each (base, year) group.
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const k = `${it.base}|${it.edition_year}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  }
  const kept: typeof items = [];
  const multiEdition = new Set<string>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => richness(b.show) - richness(a.show));
    const survivors: typeof items = [];
    for (const it of sorted) {
      const twin = survivors.find((s) => dayDiff(s.show.start_date, it.show.start_date) <= DUP_DAYS);
      if (twin) log.push(entry(it.show, 'duplicate', it.base, `duplicate of ${twin.show.id}`));
      else survivors.push(it);
    }
    if (survivors.length > 1) multiEdition.add(survivors[0].base);
    kept.push(...survivors);
  }

  // Rule 3: city suffix for series with several editions a year.
  const keyedAll: Keyed[] = [];
  for (const it of kept) {
    if (!multiEdition.has(it.base)) {
      keyedAll.push({ show: it.show, series_key: it.base, edition_year: it.edition_year });
      continue;
    }
    const city = citySlug(it.show.city);
    if (!city) {
      log.push(entry(it.show, 'no_city', it.base, 'series has several editions a year but this row has no city'));
      continue;
    }
    const series_key = `${it.base}-${city}`;
    log.push(entry(it.show, 'city_suffixed', series_key, `series "${it.base}" has several editions a year`));
    keyedAll.push({ show: it.show, series_key, edition_year: it.edition_year });
  }

  const groupBy = (list: Keyed[]) => {
    const m = new Map<string, Keyed[]>();
    for (const k of list) {
      const key = `${k.series_key}|${k.edition_year}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(k);
    }
    return m;
  };

  // Rule 4: half-year suffix for same-city repeats.
  const afterHalf: Keyed[] = [];
  for (const group of groupBy(keyedAll).values()) {
    if (group.length === 1) { afterHalf.push(group[0]); continue; }
    for (const k of group) {
      const half = Number(k.show.start_date.slice(5, 7)) <= 6 ? 'h1' : 'h2';
      const series_key = `${k.series_key}-${half}`;
      log.push(entry(k.show, 'half_year_suffixed', series_key,
        `${group.length} editions of ${k.series_key} in ${k.edition_year}: ${group.map((g) => g.show.start_date).join(', ')}`));
      afterHalf.push({ ...k, series_key });
    }
  }

  // Rule 5: anything still colliding is ambiguous.
  const keyed: Keyed[] = [];
  for (const group of groupBy(afterHalf).values()) {
    if (group.length === 1) { keyed.push(group[0]); continue; }
    for (const k of group) {
      log.push(entry(k.show, 'ambiguous', k.series_key,
        `${group.length} editions share ${k.series_key}/${k.edition_year}: ${group.map((g) => g.show.start_date).join(', ')}`));
    }
  }
  return { keyed, log };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------
export interface CalendarShowRow {
  series_key: string;
  edition_year: number;
  calendar_slug: string;
  name: string;
  name_normalized: string;
  start_date: string;
  end_date: string;
  city: string | null;
  country_code: string | null;
  country_name: string | null;
  venue: string | null;
  industries: string[];
  organiser: string | null;
  website: string | null;
  exhibitors_estimate: number | null;
  attendees_estimate: number | null;
  audience: 'b2b' | 'b2c' | 'mixed' | null;
  major_city: boolean | null;
  frequency: Frequency;
  date_status: DateStatus;
  sources: string[];
  source_urls: Record<string, string>;
  notes: string | null;
}

const intOrNull = (n: number | null) => (n == null || !Number.isFinite(n) ? null : Math.round(n));

export function toCalendarRow({ show, series_key, edition_year }: Keyed): CalendarShowRow {
  const sources = parseSources(show.source);
  return {
    series_key,
    edition_year,
    calendar_slug: show.id,
    name: show.name,
    name_normalized: normalizeName(show.name),
    start_date: show.start_date,
    end_date: show.end_date,
    city: show.city,
    country_code: show.country_code ?? countryCodeFor(show.country),
    country_name: show.country,
    venue: show.venue,
    industries: [...new Set(show.industry)],
    organiser: organiserFor(show.notes, sources),
    website: show.website,
    exhibitors_estimate: intOrNull(show.exhibitors),
    attendees_estimate: intOrNull(show.attendees),
    audience: show.audience ?? null,
    major_city: show.major_city ?? null,
    frequency: frequencyFor(show.notes),
    date_status: dateStatusFor(sources),
    sources,
    // shows.json keeps one URL per show; it belongs to the first-listed source.
    source_urls: show.source_url ? { [sources[0]]: show.source_url } : {},
    notes: show.notes || null,
  };
}
