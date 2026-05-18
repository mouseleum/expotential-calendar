#!/usr/bin/env node
// Scrape expoexhibitionstands.com/trade-show-calendar via its
// admin-ajax.php load-more endpoint. Output: data/venue-scrapes/expostands.json
//
// Unlike per-venue scrapes, this source has events from many cities/countries,
// so each event carries its own city/country/venue (merge.js prefers per-event
// fields over venue-config defaults).

import { load } from 'cheerio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENDPOINT = 'https://www.expoexhibitionstands.com/wp-admin/admin-ajax.php';
const DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COUNTRY_ALIASES = {
  'UK': 'United Kingdom', 'UAE': 'United Arab Emirates', 'USA': 'United States',
  'US': 'United States', 'KSA': 'Saudi Arabia',
};

let KNOWN_COUNTRIES = [];
async function loadCountries() {
  const list = JSON.parse(await readFile(resolve(ROOT, 'scripts/countries.json'), 'utf8'));
  // Sort longest-first so "United Arab Emirates" matches before "United"
  KNOWN_COUNTRIES = [...list, ...Object.keys(COUNTRY_ALIASES)].sort((a, b) => b.length - a.length);
}

// Find a known country as the trailing suffix of `text`, returning
// { country, cityChunk } where cityChunk is the leftover text (may need
// further trimming).
function extractCountry(text) {
  const t = text.trim();
  for (const c of KNOWN_COUNTRIES) {
    if (t.toLowerCase().endsWith(c.toLowerCase())) {
      const before = t.slice(0, t.length - c.length).trim().replace(/,\s*$/, '').trim();
      return { country: COUNTRY_ALIASES[c] || c, cityChunk: before };
    }
  }
  return { country: null, cityChunk: t };
}

// Strip trailing year ("2026") from a chunk and return [chunk_without_year, year].
function stripYear(text) {
  const m = text.match(/^(.*?)\s+(20\d{2})\s*$/);
  return m ? [m[1].trim(), m[2]] : [text.trim(), null];
}

function parseDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

async function fetchPage(page) {
  const body = new URLSearchParams({ action: 'filter_events', page: String(page) });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
  return await res.text();
}

// Parse the subtitle's "Where: <venue>[, <city>], <country>" line.
// Tolerates "Where –" (en-dash) and stops at the next labeled section
// (When, Industry, Here, About).
function parseWhere(subtitle) {
  // Accept colon, en-dash, em-dash, hyphen as the separator after Where
  const m = subtitle.match(/Where\s*[:–—\-]\s*(.+?)\s*(?=When\s*[:–—\-]|Industry\s*[:–—\-]|Here['']|About\s|$)/i);
  if (!m) return { venue: null, city: null, country: null };
  const where = m[1].trim().replace(/\s+/g, ' ').replace(/[,.]+$/, '');
  const parts = where.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { venue: null, city: null, country: null };
  const { country } = extractCountry(parts[parts.length - 1]);
  if (!country) {
    return { venue: where || null, city: null, country: null };
  }
  if (parts.length === 1) return { venue: null, city: null, country };
  if (parts.length === 2) return { venue: parts[0] || null, city: null, country };
  return {
    venue: parts.slice(0, parts.length - 2).join(', ') || null,
    city: parts[parts.length - 2],
    country,
  };
}

// Extract city/country from the title's pre-pipe section as a fallback.
// "AABC Europe 2026 Mainz, Germany" → { country: 'Germany', city: 'Mainz' }
// "CWIEME Berlin 2026 Germany" → { country: 'Germany', city: null }
function parseTitleLocation(titleRaw) {
  const pipeIdx = titleRaw.indexOf('|');
  const beforePipe = (pipeIdx >= 0 ? titleRaw.slice(0, pipeIdx) : titleRaw).trim().replace(/[,]+$/, '');
  const { country, cityChunk } = extractCountry(beforePipe);
  if (!country) return { country: null, city: null };
  // cityChunk is "<show name> <year?> <city>". Try to extract city as the
  // text after the last 4-digit year.
  const yearM = cityChunk.match(/^.*?\s+(20\d{2})\s+(.+?)[,]?\s*$/);
  if (yearM) return { country, city: yearM[2].trim() };
  // No year — city is unrecoverable from title alone
  return { country, city: null };
}

// Pull the show name from the title, stripping trailing "City, Country | Industry"
function extractName(titleRaw, knownCity, knownCountry) {
  const pipeIdx = titleRaw.indexOf('|');
  let name = pipeIdx >= 0 ? titleRaw.slice(0, pipeIdx).trim() : titleRaw.trim();
  // Strip trailing ", Country" or " Country"
  if (knownCountry) {
    const re = new RegExp(`[\\s,]*${knownCountry.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i');
    name = name.replace(re, '').trim();
  }
  if (knownCity) {
    const re = new RegExp(`[\\s,]*${knownCity.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i');
    name = name.replace(re, '').trim();
  }
  return name.replace(/[,\s]+$/, '').trim();
}

function parseEvents(html) {
  const $ = load(html);
  const events = [];
  $('.event-block').each((_, el) => {
    const $block = $(el);
    const titleRaw = $block.find('.eventdatatitle h2').text().trim();
    if (!titleRaw) return;

    const startDate = parseDate($block.find('.start_date').text().trim());
    const endDate = parseDate($block.find('.end_date').text().trim());

    const pipeIdx = titleRaw.indexOf('|');
    const industry = pipeIdx >= 0 ? titleRaw.slice(pipeIdx + 1).trim() : null;

    // Try subtitle first, fall back to title, then to class attribute.
    const subtitle = $block.find('.eventdatasubtitle p').text().replace(/\s+/g, ' ').trim();
    const where = parseWhere(subtitle);
    const titleLoc = parseTitleLocation(titleRaw);

    let country = where.country || titleLoc.country || null;
    let city = where.city || titleLoc.city || null;
    let venue = where.venue || null;

    if (!country || !city) {
      const classes = $block.attr('class') || '';
      const tokens = classes.split(/\s+/).filter((t) => t && t !== 'event-block' && t !== 'notajax' && !/^\d+$/.test(t));
      const validTokens = tokens.filter((t) => t !== 'Always' && t !== 'Empty');
      if (validTokens.length >= 2) {
        if (!country) country = validTokens[validTokens.length - 1];
        if (!city) city = validTokens.slice(0, validTokens.length - 1).join(' ');
      }
    }
    if (country && COUNTRY_ALIASES[country]) country = COUNTRY_ALIASES[country];

    const name = extractName(titleRaw, city, country);
    const link = $block.find('a').first().attr('href') || null;

    events.push({
      name,
      start_date: startDate,
      end_date: endDate,
      city: city || null,
      country: country || null,
      venue: venue || null,
      industry: industry ? [industry] : [],
      website: link,
    });
  });

  const hasMore = $('.load-more-flag').last().attr('data-has-more') === '1';
  return { events, hasMore };
}

async function main() {
  await loadCountries();
  const allEvents = [];
  let page = 1;
  while (true) {
    process.stdout.write(`page ${page}... `);
    try {
      const html = await fetchPage(page);
      const { events, hasMore } = parseEvents(html);
      allEvents.push(...events);
      console.log(`${events.length} events${hasMore ? '' : ' (last page)'}`);
      if (!hasMore || events.length === 0) break;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      break;
    }
    page++;
    await sleep(DELAY_MS);
  }

  const out = {
    venue_id: 'expostands',
    scraped_at: new Date().toISOString(),
    source_url: 'https://www.expoexhibitionstands.com/trade-show-calendar/',
    events: allEvents,
  };
  const outPath = resolve(ROOT, 'data/venue-scrapes/expostands.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`\nDone. ${allEvents.length} events → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
