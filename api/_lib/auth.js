// Shared-secret write protection for the KV-backed endpoints.
//
// If the WRITE_TOKEN env var is set, mutating requests must carry it in the
// x-write-token header; GETs stay open. When it's unset (local dev, or before
// the var is configured) writes are allowed so nothing breaks.

import { timingSafeEqual } from 'node:crypto';

export function requireWriteAuth(req, res) {
  const expected = process.env.WRITE_TOKEN;
  if (!expected) return true;
  const got = String(req.headers['x-write-token'] || '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) res.status(401).json({ error: 'invalid or missing write token' });
  return ok;
}
