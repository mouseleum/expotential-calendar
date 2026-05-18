import { useCallback, useEffect, useState } from 'react';

const KEY = 'expotential-calendar.col-widths.v1';

export function useColumnWidths(defaults) {
  const [widths, setWidths] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(widths)); } catch {}
  }, [widths]);

  // Start a drag-to-resize on a column. Returns an onMouseDown handler.
  const startResize = useCallback((key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key] ?? defaults[key] ?? 100;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const next = Math.max(50, startW + dx);
      setWidths((w) => ({ ...w, [key]: next }));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [widths, defaults]);

  const reset = useCallback(() => setWidths(defaults), [defaults]);

  return { widths, startResize, reset };
}
