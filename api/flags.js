// Team-shared show flags (interested / attending / skip) backed by Vercel KV.
// GET    /api/flags                     → { flags: { [showId]: {state, by, at} } }
// POST   /api/flags {id, state, by?}    → { ok, id, flag }   (state: null clears)
// DELETE /api/flags?id=…                → { ok, removed }
//
// Storage: Redis HASH 'flags' (see api/_lib/kv-hash-store.js). One shared
// flag per show — this answers "is anyone covering this?", not per-user lists.

import { createHashStore, getQueryId } from './_lib/kv-hash-store.js';
import { requireWriteAuth } from './_lib/auth.js';

export const FLAG_STATES = new Set(['interested', 'attending', 'skip']);

const store = createHashStore({ hashKey: 'flags' });

// Validates a POST body → { id, flag } where flag=null means "clear".
// Returns { error } on invalid input.
export function normalizeFlag(input) {
  const { id, state, by } = input || {};
  if (!id || typeof id !== 'string') return { error: 'id required' };
  if (state == null || state === '') return { id, flag: null };
  if (!FLAG_STATES.has(state)) {
    return { error: `state must be one of: ${[...FLAG_STATES].join(', ')} (or null to clear)` };
  }
  return {
    id,
    flag: {
      state,
      by: typeof by === 'string' ? by.trim() || null : null,
      at: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const flags = await store.all();
      return res.status(200).json({ flags });
    }

    if (req.method === 'POST') {
      if (!requireWriteAuth(req, res)) return;
      const { id, flag, error } = normalizeFlag(req.body);
      if (error) return res.status(400).json({ error });
      if (flag === null) {
        await store.remove(id);
      } else {
        await store.set(id, flag);
      }
      return res.status(200).json({ ok: true, id, flag });
    }

    if (req.method === 'DELETE') {
      if (!requireWriteAuth(req, res)) return;
      const id = getQueryId(req);
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const removed = await store.remove(id);
      return res.status(200).json({ ok: true, removed });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('flags error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
