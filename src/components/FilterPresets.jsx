import { useEffect, useState } from 'react';
import { filtersToJSON, filtersFromJSON } from '../utils/filterSerialize';

export function FilterPresets({ filters, setFilters }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    fetch('/api/filter-presets')
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((d) => setPresets(d.presets || []))
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/filter-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters: filtersToJSON(filters) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPresets((p) => [...p, data.preset]);
      setActiveId(data.preset.id);
      setNaming(false);
      setDraftName('');
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function apply(preset) {
    setFilters(filtersFromJSON(preset.filters));
    setActiveId(preset.id);
  }

  async function remove(preset, e) {
    e.stopPropagation();
    if (!confirm(`Delete preset "${preset.name}"?`)) return;
    try {
      const res = await fetch(`/api/filter-presets?id=${encodeURIComponent(preset.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPresets((p) => p.filter((x) => x.id !== preset.id));
      if (activeId === preset.id) setActiveId(null);
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  }

  return (
    <div className="filter-group">
      <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Saved filters</span>
        <button
          style={{ padding: '0 4px', fontSize: 10, border: 'none', color: 'var(--accent)' }}
          onClick={() => { setNaming((n) => !n); setDraftName(''); }}
        >
          {naming ? 'cancel' : '+ save current'}
        </button>
      </div>

      {naming && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <input
            type="text"
            autoFocus
            placeholder="Name this filter…"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }}
            style={{ flex: 1, fontSize: 11 }}
          />
          <button
            onClick={save}
            disabled={saving || !draftName.trim()}
            style={{ fontSize: 10, color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      )}

      {loading && <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>loading…</div>}
      {!loading && presets.length === 0 && !naming && (
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>
          No saved filters yet. Configure filters then click "+ save current".
        </div>
      )}

      {presets.map((p) => (
        <div
          key={p.id}
          className={'filter-preset' + (p.id === activeId ? ' filter-preset--active' : '')}
          onClick={() => apply(p)}
          title={p.added_by ? `by ${p.added_by} on ${p.created_at.slice(0, 10)}` : `saved ${p.created_at.slice(0, 10)}`}
        >
          <span className="filter-preset__name">{p.name}</span>
          <button
            className="filter-preset__delete"
            onClick={(e) => remove(p, e)}
            title="Delete preset"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
