#!/usr/bin/env node
// Scrape thetradeshowcalendar.com for all countries in scripts/countries.json.
// Output: data/tradeshow-calendar-raw.json
// Usage: node scripts/scrape-tradeshow-calendar.js [country-name]
//        (no arg = all countries)

import { load } from 'cheerio';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE_URL = 'https://thetradeshowcalendar.com/ttn/index.php';
const DELAY_MS = 2000;
const PAGE_SIZE = 100;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// Country name → ISO-3166-1 alpha-2
const COUNTRY_CODES = {
  'Algeria': 'DZ', 'Angola': 'AO', 'Argentina': 'AR', 'Armenia': 'AM',
  'Australia': 'AU', 'Austria': 'AT', 'Azerbaijan': 'AZ', 'Bahamas': 'BS',
  'Bahrain': 'BH', 'Bangladesh': 'BD', 'Belgium': 'BE', 'Brazil': 'BR',
  'Bulgaria': 'BG', 'Cambodia': 'KH', 'Canada': 'CA', 'Chile': 'CL',
  'China': 'CN', 'Colombia': 'CO', 'Cote divoire': 'CI', 'Czech Republic': 'CZ',
  'Democratic Republic of the Congo': 'CD', 'Denmark': 'DK', 'Djibouti': 'DJ',
  'Dominican Republic': 'DO', 'Egypt': 'EG', 'Ethiopia': 'ET', 'Finland': 'FI',
  'France': 'FR', 'Germany': 'DE', 'Ghana': 'GH', 'Greece': 'GR',
  'Hungary': 'HU', 'India': 'IN', 'Indonesia': 'ID', 'Iraq': 'IQ',
  'Ireland': 'IE', 'Israel': 'IL', 'Italy': 'IT', 'Japan': 'JP',
  'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE', 'Latvia': 'LV',
  'Lebanon': 'LB', 'Libya': 'LY', 'Lithuania': 'LT', 'Luxembourg': 'LU',
  'Malaysia': 'MY', 'Malta': 'MT', 'Mexico': 'MX', 'Monaco': 'MC',
  'Morocco': 'MA', 'Myanmar': 'MM', 'Nepal': 'NP', 'Netherlands': 'NL',
  'New Zealand': 'NZ', 'Nigeria': 'NG', 'Norway': 'NO', 'Oman': 'OM',
  'Pakistan': 'PK', 'Panama': 'PA', 'Peru': 'PE', 'Philippines': 'PH',
  'Poland': 'PL', 'Portugal': 'PT', 'Puerto Rico': 'PR', 'Qatar': 'QA',
  'Romania': 'RO', 'Rwanda': 'RW', 'Saudi Arabia': 'SA', 'Senegal': 'SN',
  'Singapore': 'SG', 'Slovenia': 'SI', 'South Africa': 'ZA', 'South Korea': 'KR',
  'Spain': 'ES', 'Sri Lanka': 'LK', 'Sweden': 'SE', 'Switzerland': 'CH',
  'Syria': 'SY', 'Taiwan': 'TW', 'Tanzania': 'TZ', 'Thailand': 'TH',
  'Turkey': 'TR', 'Ukraine': 'UA', 'United Arab Emirates': 'AE',
  'United Kingdom': 'GB', 'United States': 'US', 'Uzbekistan': 'UZ',
  'Vietnam': 'VN',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseInt0(s) {
  if (!s) return null;
  const n = parseInt(s.replace(/[, ]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// "MAY/19 - MAY/21/2026" → { start_date: "2026-05-19", end_date: "2026-05-21" }
// "DEC/30 - JAN/02/2027" → { start_date: "2026-12-30", end_date: "2027-01-02" }
function parseDateRange(raw) {
  if (!raw) return { start_date: null, end_date: null };
  const m = raw.trim().match(/^([A-Z]{3})\/(\d{1,2})\s*-\s*([A-Z]{3})\/(\d{1,2})\/(\d{4})$/i);
  if (!m) return { start_date: null, end_date: null, raw };
  const [, sMo, sDay, eMo, eDay, yearStr] = m;
  const sMonth = MONTHS[sMo.toUpperCase()];
  const eMonth = MONTHS[eMo.toUpperCase()];
  if (!sMonth || !eMonth) return { start_date: null, end_date: null, raw };
  const endYear = parseInt(yearStr, 10);
  const startYear = sMonth > eMonth ? endYear - 1 : endYear;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start_date: `${startYear}-${pad(sMonth)}-${pad(sDay)}`,
    end_date: `${endYear}-${pad(eMonth)}-${pad(eDay)}`,
  };
}

async function fetchPage(country, offset) {
  const url = `${BASE_URL}?vShow=search&vCtry=${encodeURIComponent(country)}&vRpP=${PAGE_SIZE}&vPos=${offset}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${country} offset ${offset}: HTTP ${res.status}`);
  return await res.text();
}

function parseShows(html, country) {
  const $ = load(html);
  const shows = [];
  $('tr.row').each((_, el) => {
    const $row = $(el);
    const $link = $row.find('td.r-Name a').first();
    const name = $link.text().trim();
    if (!name) return;
    const website = $link.attr('href') || null;
    const datesRaw = $row.find('td.r-Dates .r-content').first().text().trim();
    const { start_date, end_date, raw: dateRaw } = parseDateRange(datesRaw);
    const city = $row.find('td.r-City .r-content').first().text().trim() || null;
    const ctryCell = $row.find('td.r-Ctry .r-content').first().text().trim() || country;
    const attendees = parseInt0($row.find('td.r-Att .r-content').first().text().trim());
    const exhibitors = parseInt0($row.find('td.r-Exh .r-content').first().text().trim());

    shows.push({
      id: start_date ? `${slugify(name)}-${start_date.slice(0, 7)}` : slugify(name),
      name,
      start_date,
      end_date,
      city,
      country: ctryCell,
      country_code: COUNTRY_CODES[ctryCell] || COUNTRY_CODES[country] || null,
      venue: null,
      industry: [],
      attendees,
      exhibitors,
      website,
      source: 'tradeshow_calendar',
      source_url: `${BASE_URL}?vShow=search&vCtry=${encodeURIComponent(country)}`,
      notes: dateRaw ? `unparsed date: ${dateRaw}` : '',
    });
  });

  // Parse pagination footer: "now showing 1-100 out of 1,296 exhibitions"
  const footerText = $('.bottom-nav-text').text() + $('#bottom-nav').text();
  const pageMatch = footerText.match(/showing\s+[\d,]+\s*-\s*([\d,]+)\s+out of\s+([\d,]+)/i);
  const stripComma = (s) => parseInt(s.replace(/,/g, ''), 10);
  const total = pageMatch ? stripComma(pageMatch[2]) : shows.length;
  const shownTo = pageMatch ? stripComma(pageMatch[1]) : shows.length;

  return { shows, total, shownTo };
}

async function scrapeCountry(country) {
  const all = [];
  let offset = 0;
  while (true) {
    const html = await fetchPage(country, offset);
    const { shows, total, shownTo } = parseShows(html, country);
    all.push(...shows);
    if (shownTo >= total || shows.length === 0) break;
    offset += PAGE_SIZE;
    await sleep(DELAY_MS);
  }
  return all;
}

async function main() {
  const argCountry = process.argv[2];
  const countriesPath = resolve(ROOT, 'scripts/countries.json');
  const allCountries = JSON.parse(await readFile(countriesPath, 'utf8'));
  const targets = argCountry ? [argCountry] : allCountries;

  const outPath = resolve(ROOT, 'data/tradeshow-calendar-raw.json');
  await mkdir(dirname(outPath), { recursive: true });

  const results = { scraped_at: new Date().toISOString(), countries: {}, shows: [] };
  let totalShows = 0;
  for (let i = 0; i < targets.length; i++) {
    const country = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${country}... `);
    try {
      const shows = await scrapeCountry(country);
      results.countries[country] = shows.length;
      results.shows.push(...shows);
      totalShows += shows.length;
      console.log(`${shows.length} shows`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.countries[country] = { error: err.message };
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  await writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDone. ${totalShows} shows across ${targets.length} countries → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
