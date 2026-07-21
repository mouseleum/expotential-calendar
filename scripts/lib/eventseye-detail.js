// Parses an eventseye.com show detail page for the show's own official
// website. Detail pages link several sites (the city, the venue, the show
// organizer, the show itself) all tagged class="ev-web" with a "Web Site"
// label — only the show's own link is a distinct label,
// "Official Web Site", which is what we want. Attribute order on the anchor
// varies, so this matches on inner text rather than surrounding attributes.

import { load } from 'cheerio';

export function extractOfficialWebsite(html) {
  const $ = load(html);
  let found = null;
  $('a.ev-web').each((_, el) => {
    const $a = $(el);
    if ($a.text().trim() === 'Official Web Site') {
      found = $a.attr('href') || null;
      return false; // stop — first match wins
    }
  });
  return found;
}
