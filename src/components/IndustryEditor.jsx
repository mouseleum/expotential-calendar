import { useEffect, useRef, useState } from 'react';
import { INDUSTRY_SEGMENTS, INDUSTRY_COLORS } from '../utils/industries';

const SEGMENT_SET = new Set(INDUSTRY_SEGMENTS);

function chipStyle(seg, { faded = false } = {}) {
  const c = INDUSTRY_COLORS[seg];
  if (!c) return {};
  return {
    background: c.bg,
    color: c.fg,
    border: `1px solid ${c.border}`,
    opacity: faded ? 0.35 : 1,
  };
}

export function IndustryEditor({ show, overrides, onChange }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef(null);

  const baseSegments = (show.industry || []).filter((t) => SEGMENT_SET.has(t));
  const effective = overrides[show.id] || baseSegments;
  const isOverridden = show.id in overrides;
  const effectiveSet = new Set(effective);

  const [draft, setDraft] = useState(() => new Set(effective));
  useEffect(() => {
    if (open) setDraft(new Set(effective));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle(seg) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(seg)) next.delete(seg); else next.add(seg);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const industry = [...draft];
      const res = await fetch('/api/industry-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: show.id, industry }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onChange(show.id, industry);
      setOpen(false);
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setSaving(true);
    try {
      const res = await fetch(`/api/industry-overrides?id=${encodeURIComponent(show.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChange(show.id, null);
      setOpen(false);
    } catch (err) {
      alert(`Failed to clear: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <div
        className="industry-cell"
        onClick={() => setOpen((o) => !o)}
        data-override={isOverridden}
        title="Click to edit"
      >
        {effective.length === 0 ? (
          <span className="industry-cell__empty">+ tag</span>
        ) : (
          effective.map((seg) => (
            <span key={seg} className="industry-pill" style={chipStyle(seg)}>
              {seg.replace('Industrial / Manufacturing', 'Industrial/Manuf.')
                  .replace('Automotive & Transportation', 'Auto & Transport')
                  .replace('Construction & Building', 'Construction')
                  .replace('Professional Services', 'Prof. Services')
                  .replace('Technology & IT', 'Tech & IT')
                  .replace('Medical & Pharma', 'Medical')}
            </span>
          ))
        )}
        <span className="industry-cell__edit">✎</span>
      </div>
      {open && (
        <div className="industry-popover industry-popover--chips">
          <div className="industry-popover__title">
            Industries{isOverridden && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>(edited)</span>}
          </div>
          {INDUSTRY_SEGMENTS.map((seg) => {
            const on = draft.has(seg);
            return (
              <div
                key={seg}
                className="industry-pill industry-pill--row"
                style={chipStyle(seg, { faded: !on })}
                onClick={() => toggle(seg)}
              >
                {seg}
              </div>
            );
          })}
          <div className="industry-popover__actions">
            {isOverridden && (
              <button onClick={clearOverride} disabled={saving} style={{ fontSize: 10 }}>
                Reset
              </button>
            )}
            <button onClick={() => setOpen(false)} disabled={saving} style={{ fontSize: 10 }}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{ fontSize: 10, color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
