// Saved filter presets — named filter configurations shared across users via KV.
//
// GET    /api/filter-presets                  → { presets: [...] }
// POST   /api/filter-presets {name, filters}  → { ok, preset }
// DELETE /api/filter-presets?id=…             → { ok, removed }
//
// Filter shape: Sets serialized as arrays. The client converts on save/load.

import { kv } from '@vercel/kv';

const KEY = 'filter-presets:v1';
const MAX_NAME = 60;
const MAX_PRESETS = 100;

function genId() {
  return 'pre_' + Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const presets = (await kv.get(KEY)) || [];
      return res.status(200).json({ presets });
    }

    if (req.method === 'POST') {
      const { name, filters, added_by } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > MAX_NAME) {
        return res.status(400).json({ error: `name too long (max ${MAX_NAME})` });
      }
      if (!filters || typeof filters !== 'object') {
        return res.status(400).json({ error: 'filters must be an object' });
      }
      const current = (await kv.get(KEY)) || [];
      if (current.length >= MAX_PRESETS) {
        return res.status(400).json({ error: `preset limit reached (${MAX_PRESETS})` });
      }
      const preset = {
        id: genId(),
        name: name.trim(),
        filters,
        added_by: typeof added_by === 'string' ? added_by.trim() || null : null,
        created_at: new Date().toISOString(),
      };
      current.push(preset);
      await kv.set(KEY, current);
      return res.status(200).json({ ok: true, preset });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const current = (await kv.get(KEY)) || [];
      const filtered = current.filter((p) => p.id !== id);
      await kv.set(KEY, filtered);
      return res.status(200).json({ ok: true, removed: current.length - filtered.length });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('filter-presets error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
