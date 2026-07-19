// Filter state ↔ URL query param. Venue/country values contain commas,
// spaces, and diacritics, so per-field params are fragile — the whole filter
// object is base64url-encoded JSON in a single `f` param instead. Decoding
// goes through the hardened filtersFromJSON, so a stale or garbage link can
// never crash the app.

import { filtersToJSON, filtersFromJSON } from './filterSerialize';

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// '' when filters equal `defaults` (keeps the address bar clean on load).
export function filtersToParam(filters, defaults) {
  const json = JSON.stringify(filtersToJSON(filters));
  if (defaults && json === JSON.stringify(filtersToJSON(defaults))) return '';
  return b64urlEncode(json);
}

// null when the param is absent/undecodable — caller falls back to defaults.
export function filtersFromParam(param) {
  if (!param) return null;
  try {
    const obj = JSON.parse(b64urlDecode(param));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return filtersFromJSON(obj);
  } catch {
    return null;
  }
}
