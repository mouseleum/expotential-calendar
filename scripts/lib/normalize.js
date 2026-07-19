// Pure normalization/matching helpers shared by merge.js and the test
// suite. merge.js runs its pipeline on import, so anything that needs to be
// imported elsewhere lives here.

// Tokenize a show name for scan2lead matching: lowercase, strip diacritics,
// drop tokens shorter than 3 chars. (Same shape as normalizeForMatch but
// without removing stop tokens — we want every distinguishing token here.)
export function s2lTokens(name) {
  return new Set(
    (name || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&amp;|&/g, 'and')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
}

// Generic words that aren't distinguishing on their own — if a scan2lead
// entry boils down to just one of these, drop the entry (would match
// every "<X> Festival" / "<Y> Show" in the dataset). Includes the cities
// that appear in the scan2lead list, since e.g. "A+A Düsseldorf" reduces
// to just {dusseldorf} after filtering short tokens.
export const S2L_GENERIC = new Set([
  // generic event words
  'festival', 'show', 'expo', 'fair', 'conference', 'congress',
  'summit', 'forum', 'days', 'week', 'salon', 'world',
  'europe', 'asia', 'global', 'international',
  // common cities that appear in the scan2lead list
  'dusseldorf', 'munich', 'berlin', 'frankfurter', 'frankfurt',
  'leipzig', 'basel', 'nuremberg', 'dubai', 'hannover',
  // tokens left over after the distinguishing prefix gets filtered as too
  // short — e.g. "DIGITAL X" → {digital}, "EM-POWER" → {power}, "IT-TRANS"
  // → {trans}. These match too broadly on their own.
  'digital', 'power', 'trans', 'mobility',
]);

// Pre-compute scan2lead token sets once.
export function prepareScan2Lead(names) {
  return names
    .map((name) => ({ name, tokens: [...s2lTokens(name)] }))
    .filter((e) => {
      if (e.tokens.length === 0) return false;
      // Single-token entries must not be a generic word
      if (e.tokens.length === 1 && S2L_GENERIC.has(e.tokens[0])) return false;
      return true;
    });
}

// True if the show name's tokens include EVERY token of a scan2lead entry.
export function matchesScan2Lead(showName, prepared) {
  const showTokens = s2lTokens(showName);
  if (showTokens.size === 0) return false;
  return prepared.some(({ tokens }) => tokens.every((t) => showTokens.has(t)));
}

// Strip accents (NFD-decomposable) plus handle Nordic letters that don't
// decompose (ø/Ø, æ/Æ, å/Å, ð/Ð, þ/Þ) and the German ß.
export function stripDiacritics(s) {
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

// Words that look like generic-suffix terms eventseye/RX append to venue
// names but aren't actually cities. Keep these — don't strip them.
export const KEEP_VENUE_SUFFIX = new Set([
  'expo', 'centre', 'center', 'hall', 'fair', 'forum', 'centro', 'palais',
  'arena', 'kongress', 'mässan', 'messe',
]);

// Normalize a venue name:
//   1. Strip trailing ", <city>" if it matches the show's city
//   2. Strip trailing ", <SingleCapitalizedWord>" (eventseye habit)
//   3. Look up in the aliases map (full lowercase string match)
export function normalizeVenue(venue, city, aliases) {
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

// Extract a domain key from a URL for venue lookup. Returns the last 2-3
// labels (handles co.uk, com.br, etc.).
export function urlToDomain(url) {
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
