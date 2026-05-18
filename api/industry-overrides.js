// Per-show industry overrides. Lets anyone tag an existing show (scraped or manual)
// with canonical industry segments — change persists in KV and is merged onto the
// show on the client.
//
// GET    /api/industry-overrides              → { overrides: { [showId]: string[] } }
// POST   /api/industry-overrides { id, industry } → { ok, overrides }
// DELETE /api/industry-overrides?id=…         → { ok, removed }

import { kv } from '@vercel/kv';

const KEY = 'industry-overrides:v1';

const SEGMENTS = new Set([
  'Technology & IT',
  'Medical & Pharma',
  'Industrial / Manufacturing',
  'Construction & Building',
  'Professional Services',
  'Automotive & Transportation',
]);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const overrides = (await kv.get(KEY)) || {};
      return res.status(200).json({ overrides });
    }

    if (req.method === 'POST') {
      const { id, industry } = req.body || {};
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id required' });
      }
      if (!Array.isArray(industry)) {
        return res.status(400).json({ error: 'industry must be an array' });
      }
      const validated = industry
        .filter((s) => typeof s === 'string' && SEGMENTS.has(s));

      const overrides = (await kv.get(KEY)) || {};
      if (validated.length === 0) delete overrides[id];
      else overrides[id] = validated;
      await kv.set(KEY, overrides);
      return res.status(200).json({ ok: true, id, industry: validated });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const overrides = (await kv.get(KEY)) || {};
      const had = id in overrides;
      delete overrides[id];
      await kv.set(KEY, overrides);
      return res.status(200).json({ ok: true, removed: had ? 1 : 0 });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('industry-overrides error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
