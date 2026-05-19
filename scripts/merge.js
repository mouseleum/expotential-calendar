#!/usr/bin/env node
// Merge raw scraper outputs (Tradeshow Calendar + per-venue scrapes)
// → final data/shows.json + src/data/shows.json
// Conflicts go to data/review-needed.json.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RAW_PATH = resolve(ROOT, 'data/tradeshow-calendar-raw.json');
const VENUE_DIR = resolve(ROOT, 'data/venue-scrapes');
const VENUES_CONFIG = resolve(ROOT, 'scripts/venues.json');
const VENUE_DOMAINS = resolve(ROOT, 'scripts/venue-domains.json');
const INDUSTRY_RULES = resolve(ROOT, 'scripts/industry-rules.json');
const VENUE_ALIASES = resolve(ROOT, 'scripts/venue-aliases.json');
const AUDIENCE_PATH = resolve(ROOT, 'data/audience-classifications.json');

// Strip accents (NFD-decomposable) plus handle Nordic letters that don't
// decompose (ø/Ø, æ/Æ, å/Å, ð/Ð, þ/Þ) and the German ß.
function stripDiacritics(s) {
  if (!s) return '';
  return s.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/å/g, 'a').replace(/Å/g, 'A')
    .replace(/ð/g, 'd').replace(/Ð/g, 'D')
    .replace(/þ/g, 'th').replace(/Þ/g, 'Th')
    .replace(/ß/g, 'ss');
}

async function loadVenueAliases() {
  if (!existsSync(VENUE_ALIASES)) return {};
  const data = JSON.parse(await readFile(VENUE_ALIASES, 'utf8'));
  return data.aliases || {};
}

// Words that look like generic-suffix terms eventseye/RX append to venue
// names but aren't actually cities. Keep these — don't strip them.
const KEEP_VENUE_SUFFIX = new Set([
  'expo', 'centre', 'center', 'hall', 'fair', 'forum', 'centro', 'palais',
  'arena', 'kongress', 'mässan', 'messe',
]);

// Normalize a venue name:
//   1. Strip trailing ", <city>" if it matches the show's city
//   2. Strip trailing ", <SingleCapitalizedWord>" (eventseye habit)
//   3. Look up in the aliases map (full lowercase string match)
function normalizeVenue(venue, city, aliases) {
  if (!venue) return null;
  let v = venue.trim();

  // 1. Strip exact show-city match first (handles diacritics)
  if (city) {
    const cityNorm = stripDiacritics(city.toLowerCase());
    const vNorm = stripDiacritics(v.toLowerCase());
    if (vNorm.endsWith(', ' + cityNorm)) {
      v = v.slice(0, v.length - (cityNorm.length + 2)).trim();
    }
  }

  // 2. Strip trailing ", <SingleCapitalizedWord>" — typical eventseye output
  //    Skip if the trailing word looks like a venue noun (Expo, Centre, …).
  const tailMatch = v.match(/,\s*([A-ZÀ-Ý][a-zà-ÿ]{2,})\s*$/u);
  if (tailMatch && !KEEP_VENUE_SUFFIX.has(tailMatch[1].toLowerCase())) {
    v = v.slice(0, tailMatch.index).trim();
  }

  // 3. Aliases
  const alias = aliases[v.toLowerCase()];
  return alias || v || null;
}
const FINAL_PATH = resolve(ROOT, 'data/shows.json');
const SHIP_PATH = resolve(ROOT, 'src/data/shows.json');
const REVIEW_PATH = resolve(ROOT, 'data/review-needed.json');

async function loadIndustryRules() {
  if (!existsSync(INDUSTRY_RULES)) return null;
  const data = JSON.parse(await readFile(INDUSTRY_RULES, 'utf8'));
  // Pre-compile name keyword regexes
  const compiled = { ...data, name_regex: {} };
  for (const [seg, patterns] of Object.entries(data.name_keywords || {})) {
    compiled.name_regex[seg] = patterns.map((p) => new RegExp(p, 'i'));
  }
  // Lowercased raw-tag substrings for fast matching
  compiled.raw_tag_lower = {};
  for (const [seg, tags] of Object.entries(data.raw_tag_map || {})) {
    compiled.raw_tag_lower[seg] = tags.map((t) => t.toLowerCase());
  }
  return compiled;
}

// Returns the set of canonical segments for a show. Combines raw_tag matches
// (substring in the show's existing industry array) and name_keyword matches
// (regex against show.name).
function classifySegments(show, rules) {
  if (!rules) return new Set();
  const out = new Set();
  const rawTags = (show.industry || []).map((t) => String(t).toLowerCase());
  for (const [seg, lowerTags] of Object.entries(rules.raw_tag_lower)) {
    if (lowerTags.some((t) => rawTags.some((rt) => rt.includes(t)))) {
      out.add(seg);
    }
  }
  const name = show.name || '';
  for (const [seg, regexes] of Object.entries(rules.name_regex)) {
    if (regexes.some((r) => r.test(name))) out.add(seg);
  }
  return out;
}

// Extract a domain key from a URL for venue lookup. Returns the last 2-3
// labels (handles co.uk, com.br, etc.).
function urlToDomain(url) {
  if (!url) return null;
  try {
    // Handle protocol-relative URLs (//host/path) by prepending https:
    const normalized = url.startsWith('//') ? `https:${url}` : url;
    const host = new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
    const parts = host.split('.');
    if (parts.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

async function loadDomainMap() {
  if (!existsSync(VENUE_DOMAINS)) return {};
  const data = JSON.parse(await readFile(VENUE_DOMAINS, 'utf8'));
  return data.domains || {};
}

function pickBetter(a, b) {
  const score = (s) => [s.attendees, s.exhibitors, s.venue, s.website, s.city, s.country_code]
    .filter((v) => v !== null && v !== undefined && v !== '').length;
  return score(b) > score(a) ? b : a;
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function rebuildId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `${name}-${city}-${ym}` : `${name}-${ym}`;
}

// Words that don't carry identity — strip them so token-set comparison
// works across naming-convention differences across sources.
const STOP_TOKENS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'on', 'in', 'at', 'by', 'to',
  'annual', 'conference', 'congress', 'meeting', 'expo', 'exposition',
  'summit', 'symposium', 'forum', 'fair', 'exhibition', 'show', 'event',
  'days', 'week', 'days', 'trade',
  'international', 'global', 'world', 'european', 'europe', 'asian', 'asia',
  'american', 'america', 'north', 'south', 'east', 'west',
]);

function normalizeForMatch(name, city) {
  const cityTokens = (city || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;|&/g, 'and')
    .replace(/\b20\d{2}\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_TOKENS.has(w) && !cityTokens.includes(w));
  return [...new Set(tokens)].sort().join(' ');
}

// True if two shows are likely the same: similar normalized name + same city +
// overlapping start month (allow ±1 month for events that span the boundary).
function isLikelyDup(a, b) {
  if (!a.city || !b.city) return false;
  if (stripDiacritics(a.city.toLowerCase()) !== stripDiacritics(b.city.toLowerCase())) return false;
  const na = normalizeForMatch(a.name, a.city);
  const nb = normalizeForMatch(b.name, b.city);
  if (!na || !nb) return false;
  if (na !== nb) {
    const setA = new Set(na.split(' ').filter(Boolean));
    const setB = new Set(nb.split(' ').filter(Boolean));
    if (setA.size === 0 || setB.size === 0) return false;
    const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    let overlap = 0;
    for (const t of small) if (big.has(t)) overlap++;
    // Require at least 1 shared identity token; allow up to 1 missing if the
    // smaller set has ≥2 tokens (so initialisms and acronym variants still merge).
    const allowedMisses = small.size >= 2 ? 1 : 0;
    if (small.size - overlap > allowedMisses) return false;
  }
  if (!a.start_date || !b.start_date) return false;
  const monthsApart = Math.abs(
    (new Date(a.start_date + 'T00:00:00Z') - new Date(b.start_date + 'T00:00:00Z')) / (1000 * 60 * 60 * 24)
  );
  return monthsApart <= 14; // within ~2 weeks → same edition
}

async function loadTradeshowCalendar() {
  if (!existsSync(RAW_PATH)) return { shows: [], scraped_at: null };
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
  for (const s of raw.shows) s.id = rebuildId(s);
  return raw;
}

async function loadVenueScrapes(aliases) {
  if (!existsSync(VENUE_DIR)) return [];
  const venuesConfig = existsSync(VENUES_CONFIG)
    ? JSON.parse(await readFile(VENUES_CONFIG, 'utf8'))
    : [];
  const byId = new Map(venuesConfig.map((v) => [v.id, v]));
  const files = (await readdir(VENUE_DIR)).filter((f) => f.endsWith('.json'));
  const shows = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(resolve(VENUE_DIR, file), 'utf8'));
    const venue = byId.get(data.venue_id);
    if (!venue) {
      console.warn(`venue-scrape ${file}: no matching entry in venues.json for id=${data.venue_id}`);
      continue;
    }
    for (const ev of data.events) {
      // Per-event city/country/venue override the venue-config defaults.
      // This supports multi-venue sources (e.g. third-party calendars).
      const city = ev.city || venue.city || null;
      const country = ev.country || venue.country || null;
      const country_code = ev.country_code || (country === venue.country ? venue.country_code : null) || null;
      const rawVenue = ev.venue || venue.name || null;
      const venueName = normalizeVenue(rawVenue, city, aliases);
      const show = {
        name: ev.name,
        start_date: ev.start_date,
        end_date: ev.end_date,
        city,
        country,
        country_code,
        venue: venueName,
        industry: ev.industry || [],
        attendees: ev.attendees ?? null,
        exhibitors: ev.exhibitors ?? null,
        website: ev.website || null,
        source: `venue:${venue.id}`,
        source_url: ev.website || venue.url,
        notes: ev.notes || '',
      };
      show.id = rebuildId(show);
      shows.push(show);
    }
  }
  return shows;
}

async function main() {
  const aliases = await loadVenueAliases();
  const ttc = await loadTradeshowCalendar();
  // Normalize any TTC venues too (rare today — TTC doesn't provide venue —
  // but cheap to run, and future-proofs if TTC ever exposes venue).
  for (const s of ttc.shows) if (s.venue) s.venue = normalizeVenue(s.venue, s.city, aliases);
  const venueShows = await loadVenueScrapes(aliases);
  const domainMap = await loadDomainMap();
  const byId = new Map();
  const conflicts = [];

  // 1. Tradeshow Calendar first (preferred source — more structured data)
  for (const show of ttc.shows) {
    if (!show.start_date) {
      conflicts.push({ reason: 'missing start_date', show });
      continue;
    }
    const existing = byId.get(show.id);
    if (!existing) byId.set(show.id, show);
    else if (existing.name === show.name) byId.set(show.id, pickBetter(existing, show));
    else conflicts.push({ reason: 'id collision (intra-ttc)', id: show.id, existing, incoming: show });
  }

  // 2. Venue scrapes — fuzzy-match against existing first to avoid dups.
  // Bucket by normalized city (diacritic-stripped, lowercase) so spellings
  // like "Lillestrom" and "Lillestrøm" share a bucket.
  const cityKey = (city) => stripDiacritics((city || '').toLowerCase());
  const existingByCity = new Map();
  for (const s of byId.values()) {
    const k = cityKey(s.city);
    if (!existingByCity.has(k)) existingByCity.set(k, []);
    existingByCity.get(k).push(s);
  }

  let venueAdded = 0;
  let venueMerged = 0;
  for (const show of venueShows) {
    if (!show.start_date) {
      conflicts.push({ reason: 'venue: missing start_date', show });
      continue;
    }
    const k = cityKey(show.city);
    const cityShows = existingByCity.get(k) || [];
    const dup = cityShows.find((s) => isLikelyDup(s, show));
    if (dup) {
      if (!dup.venue) dup.venue = show.venue;
      if (!dup.website) dup.website = show.website;
      if (!dup.source.includes(show.source)) dup.source += `+${show.source}`;
      venueMerged++;
    } else if (byId.has(show.id)) {
      conflicts.push({ reason: 'venue: id collision, fuzzy missed', id: show.id, existing: byId.get(show.id), incoming: show });
    } else {
      byId.set(show.id, show);
      if (!existingByCity.has(k)) existingByCity.set(k, []);
      existingByCity.get(k).push(show);
      venueAdded++;
    }
  }

  // Apply industry-segment classification (rules-based). Adds canonical
  // segments to show.industry while preserving any existing raw tags.
  const rules = await loadIndustryRules();
  let segmentsTagged = 0;
  const perSegment = {};
  for (const show of byId.values()) {
    const segs = classifySegments(show, rules);
    if (segs.size === 0) continue;
    const existing = new Set(show.industry || []);
    let added = false;
    for (const s of segs) {
      if (!existing.has(s)) { existing.add(s); added = true; }
      perSegment[s] = (perSegment[s] || 0) + 1;
    }
    if (added) segmentsTagged++;
    show.industry = [...existing];
  }

  // Apply persisted Haiku audience classifications, if any.
  let audienceApplied = 0;
  if (existsSync(AUDIENCE_PATH)) {
    const audiences = JSON.parse(await readFile(AUDIENCE_PATH, 'utf8'));
    for (const show of byId.values()) {
      if (audiences[show.id]) { show.audience = audiences[show.id]; audienceApplied++; }
    }
  }

  // Apply URL→venue mapping for shows without a venue. Only enriches if
  // the mapped city matches the show's city (or show city is missing).
  let venueFromUrl = 0;
  for (const show of byId.values()) {
    if (show.venue || !show.website) continue;
    const dom = urlToDomain(show.website);
    if (!dom) continue;
    const v = domainMap[dom];
    if (!v) continue;
    if (show.city && v.city && show.city.toLowerCase() !== v.city.toLowerCase()) continue;
    show.venue = v.venue;
    if (!show.city && v.city) show.city = v.city;
    if (!show.country && v.country) show.country = v.country;
    venueFromUrl++;
  }

  const shows = [...byId.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const final = {
    generated_at: new Date().toISOString(),
    source_scraped_at: ttc.scraped_at,
    count: shows.length,
    countries: new Set(shows.map((s) => s.country).filter(Boolean)).size,
    shows,
  };

  await mkdir(dirname(FINAL_PATH), { recursive: true });
  await mkdir(dirname(SHIP_PATH), { recursive: true });
  await writeFile(FINAL_PATH, JSON.stringify(final, null, 2));
  await writeFile(SHIP_PATH, JSON.stringify(final, null, 2));
  await writeFile(REVIEW_PATH, JSON.stringify({ conflicts }, null, 2));

  console.log(`TTC: ${ttc.shows.length} shows`);
  console.log(`Venues: ${venueShows.length} events (added ${venueAdded}, merged ${venueMerged})`);
  console.log(`Audience tags: ${audienceApplied} shows tagged (B2B / B2C / mixed)`);
  console.log(`Domain map: ${venueFromUrl} shows enriched with venue from URL`);
  console.log(`Industry rules: ${segmentsTagged} shows tagged with ≥1 canonical segment`);
  for (const [seg, n] of Object.entries(perSegment).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${seg}`);
  }
  console.log(`Final: ${shows.length} shows / ${final.countries} countries`);
  console.log(`  → ${SHIP_PATH}`);
  if (conflicts.length) console.log(`${conflicts.length} conflicts → ${REVIEW_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
