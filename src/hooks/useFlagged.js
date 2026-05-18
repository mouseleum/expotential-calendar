import { useCallback, useEffect, useState } from 'react';

const KEY = 'expotential-calendar.flags.v1';
// state: 'interested' | 'attending' | 'skip' | null
const ORDER = [null, 'interested', 'attending', 'skip'];

export function useFlagged() {
  const [flags, setFlags] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(flags));
    } catch {
      // localStorage may be unavailable; flags become session-only.
    }
  }, [flags]);

  const cycle = useCallback((id) => {
    setFlags((prev) => {
      const current = prev[id] || null;
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      const out = { ...prev };
      if (next) out[id] = next;
      else delete out[id];
      return out;
    });
  }, []);

  return { flags, cycle };
}
