import { useEffect, useRef, useState } from 'react';
import { INDUSTRY_SEGMENTS } from '../utils/industries';

const SEGMENT_SET = new Set(INDUSTRY_SEGMENTS);

// Short labels for the dropdown trigger button (one initial per segment).
const SHORT = {
  'Technology & IT': 'T',
  'Medical & Pharma': 'M',
  'Industrial / Manufacturing': 'I',
  'Construction & Building': 'C',
  'Professional Services': 'P',
  'Automotive & Transportation': 'A',
};

export function IndustryEditor({ show, overrides, onChange }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef(null);

  // Effective segments = override if present, else canonical segments from show.industry
  const baseSegments = (show.industry || []).filter((t) => SEGMENT_SET.has(t));
  const effective = overrides[show.id] || baseSegments;
  const isOverridden = show.id in overrides;

  // Local draft state for the popover
  const [draft, setDraft] = useState(new Set(effective));
  useEffect(() => {
    if (open) setDraft(new Set(effective));
  }, [open]);

  // Close on outside click
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
      onChange(show.id, null); // null = remove override
      setOpen(false);
    } catch (err) {
      alert(`Failed to clear: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        className="industry-chip"
        onClick={() => setOpen((o) => !o)}
        title={effective.length === 0 ? 'No industry set — click to edit' : effective.join(', ')}
        data-override={isOverridden}
      >
        {effective.length === 0 ? (
          <span style={{ color: 'var(--text-dimmer)' }}>+</span>
        ) : (
          effective.map((s) => SHORT[s] || '?').join('')
        )}
      </button>
      {open && (
        <div className="industry-popover">
          <div className="industry-popover__title">
            Industries{isOverridden && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>(edited)</span>}
          </div>
          {INDUSTRY_SEGMENTS.map((seg) => (
            <label key={seg} className="industry-popover__row">
              <input
                type="checkbox"
                checked={draft.has(seg)}
                onChange={() => toggle(seg)}
              />
              <span>{seg}</span>
            </label>
          ))}
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
