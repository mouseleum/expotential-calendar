// Vercel serverless function — manual-shows store backed by Vercel KV.
// GET  /api/manual-shows         → { shows: [...] }
// POST /api/manual-shows {show}  → { ok: true, show: {...} }
// DELETE /api/manual-shows?id=…  → { ok: true }
//
// KV key layout: a single key 'manual-shows:v1' holds the JSON array.
// (For our scale — manual additions, never more than a few hundred —
// one round-trip read/write is simpler than per-show keys.)

import { kv } from '@vercel/kv';

const KEY = 'manual-shows:v1';

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function makeId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `manual-${name}-${city}-${ym}` : `manual-${name}-${ym}`;
}

function normalize(input) {
  // Required + nullable validation
  const errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('body must be an object');
    return { errors };
  }
  if (!input.name || typeof input.name !== 'string') errors.push('name required');
  if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) errors.push('start_date must be YYYY-MM-DD');
  if (input.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) errors.push('end_date must be YYYY-MM-DD');
  if (!input.country || typeof input.country !== 'string') errors.push('country required');
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
    attendees: Number.isFinite(+input.attendees) ? +input.attendees : null,
    exhibitors: Number.isFinite(+input.exhibitors) ? +input.exhibitors : null,
    website: (input.website || '').trim() || null,
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
      const shows = (await kv.get(KEY)) || [];
      return res.status(200).json({ shows });
    }

    if (req.method === 'POST') {
      const { show, errors } = normalize(req.body);
      if (errors) return res.status(400).json({ errors });
      const current = (await kv.get(KEY)) || [];
      const filtered = current.filter((s) => s.id !== show.id);
      filtered.push(show);
      await kv.set(KEY, filtered);
      return res.status(200).json({ ok: true, show });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const current = (await kv.get(KEY)) || [];
      const filtered = current.filter((s) => s.id !== id);
      await kv.set(KEY, filtered);
      return res.status(200).json({ ok: true, removed: current.length - filtered.length });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('manual-shows error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
