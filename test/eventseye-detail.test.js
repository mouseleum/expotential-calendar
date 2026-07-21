import { describe, it, expect } from 'vitest';
import { extractOfficialWebsite } from '../scripts/lib/eventseye-detail.js';

// Trimmed fixture mirroring the real markup: city + venue + organizer links
// all share class="ev-web" and the label "Web Site"; only the show's own
// link is labeled "Official Web Site". Attribute order intentionally varies
// per anchor, matching what's actually served.
function page(showAnchor) {
  return `<html><body>
    <a href="http://www.messecenter.dk/uk" rel="nofollow" target="_blank" title="Exhibition Centre Herning" class="ev-web"><u>Web Site</u></a>
    <a class="ev-web" href="http://www.mch.dk" rel="nofollow" target="_blank" title="MCH Messecenter Herning"><u>Web Site</u></a>
    ${showAnchor}
  </body></html>`;
}

describe('extractOfficialWebsite', () => {
  it('picks the anchor labeled "Official Web Site", ignoring other ev-web links', () => {
    const html = page(
      '<a rel="nofollow" target="_blank" title="Go to FORMLAND website" href="http://www.formland.com" class="ev-web"><u>Official Web Site</u></a>',
    );
    expect(extractOfficialWebsite(html)).toBe('http://www.formland.com');
  });

  it('is unaffected by attribute order', () => {
    const html = page(
      '<a class="ev-web" title="Go to X website" rel="nofollow" href="http://x.example.com" target="_blank"><u>Official Web Site</u></a>',
    );
    expect(extractOfficialWebsite(html)).toBe('http://x.example.com');
  });

  it('returns null when no official-site link is present', () => {
    expect(extractOfficialWebsite(page(''))).toBe(null);
  });

  it('does not match a plain "Web Site" label', () => {
    const html = page(
      '<a class="ev-web" href="http://organizer.example.com"><u>Web Site</u></a>',
    );
    expect(extractOfficialWebsite(html)).toBe(null);
  });
});
