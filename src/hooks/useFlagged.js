import { useCallback, useEffect, useState } from 'react';
import { writeFetch } from '../utils/api';

// Team-shared flags backed by /api/flags. Shape: { [showId]: {state, by, at} }.
// state: 'interested' | 'attending' | 'skip'. Cycling is optimistic; a failed
// save rolls back (except 404 — no API deployed, e.g. plain `vite preview` —
// where flags simply stay session-local).

const LEGACY_KEY = 'expotential-calendar.flags.v1';
const ORDER = [null, 'interested', 'attending', 'skip'];

export function useFlagged() {
  const [flags, setFlags] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let server = {};
      let haveServer = false;
      try {
        const r = await fetch('/api/flags');
        if (r.ok) {
          server = (await r.json()).flags || {};
          haveServer = true;
        }
      } catch { /* offline — flags stay session-local */ }

      // One-time migration of pre-KV localStorage flags: push any the server
      // doesn't know about, silently (no token prompt on page load — if the
      // write is rejected the local copy is kept for a later attempt).
      let legacy;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)) || {}; } catch { legacy = {}; }
      const toMigrate = Object.entries(legacy).filter(
        ([id, state]) => ORDER.includes(state) && state && !server[id],
      );
      if (haveServer && toMigrate.length > 0) {
        const results = await Promise.all(toMigrate.map(([id, state]) =>
          writeFetch('/api/flags', {
            method: 'POST',
            body: JSON.stringify({ id, state }),
          }, { silent: true }).then((r) => r.ok).catch(() => false),
        ));
        toMigrate.forEach(([id, state], i) => {
          if (results[i]) server[id] = { state, by: null, at: null };
        });
        if (results.every(Boolean)) {
          try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
        }
      }
      if (!cancelled) setFlags(server);
    })();
    return () => { cancelled = true; };
  }, []);

  const cycle = useCallback((id) => {
    setFlags((prev) => {
      const current = prev[id]?.state || null;
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      const out = { ...prev };
      if (next) out[id] = { state: next, by: null, at: null };
      else delete out[id];

      writeFetch('/api/flags', {
        method: 'POST',
        body: JSON.stringify({ id, state: next }),
      })
        .then((res) => {
          if (res.status === 404) return; // no API locally — keep session-local
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
        .catch((err) => {
          setFlags((p) => {
            const rolledBack = { ...p };
            if (current) rolledBack[id] = prev[id];
            else delete rolledBack[id];
            return rolledBack;
          });
          alert(`Failed to save flag: ${err.message}`);
        });

      return out;
    });
  }, []);

  return { flags, cycle };
}
