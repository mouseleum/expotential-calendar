// Vercel serverless function — manual-shows store backed by Vercel KV.
// GET    /api/manual-shows         → { shows: [...] }
// POST   /api/manual-shows {show}  → { ok: true, show: {...} }
// DELETE /api/manual-shows?id=…    → { ok: true }
//
// Storage: a Redis HASH at 'manual-shows' (see api/_lib/kv-hash-store.js);
// the legacy 'manual-shows:v1' array key is migrated on first read.

import { slugify } from '../scripts/lib/slugify.js';
import { createHashStore, getQueryId } from './_lib/kv-hash-store.js';

const store = createHashStore({
  hashKey: 'manual-shows',
  legacyKey: 'manual-shows:v1',
  legacyToFields(legacy) {
    if (!Array.isArray(legacy)) return {};
    const fields = {};
    for (const show of legacy) {
      if (show && show.id) fields[show.id] = show;
    }
    return fields;
  },
});

function makeId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `manual-${name}-${city}-${ym}` : `manual-${name}-${ym}`;
}

// Missing/empty counts stay null; anything else must coerce to a finite
// number (note +null and +'' are 0, so the emptiness check comes first).
function toCount(v) {
  if (v == null || v === '') return null;
  return Number.isFinite(+v) ? +v : null;
}

function normalize(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('body must be an object');
    return { errors };
  }
  if (!input.name || typeof input.name !== 'string') errors.push('name required');
  if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) errors.push('start_date must be YYYY-MM-DD');
  if (input.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) errors.push('end_date must be YYYY-MM-DD');
  if (!input.country || typeof input.country !== 'string') errors.push('country required');
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    errors.push('end_date must be on or after start_date');
  }
  const website = typeof input.website === 'string' ? input.website.trim() : '';
  if (website && !/^https?:\/\//i.test(website)) {
    errors.push('website must start with http:// or https://');
  }
  if (errors.length) return { errors };

  const show = {
    name: input.name.trim(),
    start_date: input.start_date,
    end_date: input.end_date || input.start_date,
    city: (input.city || '').trim() || null,
    country: input.country.trim(),
    country_code: (input.country_code || '').trim() || null,
    venue: (input.venue || '').trim() || null,
    industry: Array.isArray(input.industry) ? input.industry : [],
    attendees: toCount(input.attendees),
    exhibitors: toCount(input.exhibitors),
    website: website || null,
    source: 'manual',
    source_url: null,
    notes: (input.notes || '').trim() || '',
    added_by: (input.added_by || '').trim() || null,
    added_at: new Date().toISOString(),
  };
  show.id = makeId(show);
  return { show };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const shows = Object.values(await store.all());
      return res.status(200).json({ shows });
    }

    if (req.method === 'POST') {
      const { show, errors } = normalize(req.body);
      if (errors) return res.status(400).json({ errors });
      await store.set(show.id, show);
      return res.status(200).json({ ok: true, show });
    }

    if (req.method === 'DELETE') {
      const id = getQueryId(req);
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const removed = await store.remove(id);
      return res.status(200).json({ ok: true, removed });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('manual-shows error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
