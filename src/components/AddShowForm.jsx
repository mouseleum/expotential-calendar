import { useState } from 'react';
import { INDUSTRY_SEGMENTS } from '../utils/industries';

const EMPTY = {
  name: '',
  start_date: '',
  end_date: '',
  city: '',
  country: '',
  venue: '',
  website: '',
  attendees: '',
  exhibitors: '',
  industries: [],
  industryOther: '',
  added_by: '',
  notes: '',
};

export function AddShowForm({ onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState(null);
  const [done, setDone] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleIndustry(seg) {
    setForm((f) => ({
      ...f,
      industries: f.industries.includes(seg)
        ? f.industries.filter((s) => s !== seg)
        : [...f.industries, seg],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    try {
      const others = form.industryOther
        ? form.industryOther.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const payload = {
        ...form,
        end_date: form.end_date || form.start_date,
        industry: [...form.industries, ...others],
        attendees: form.attendees || null,
        exhibitors: form.exhibitors || null,
      };
      delete payload.industries;
      delete payload.industryOther;
      const res = await fetch('/api/manual-shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors || [data.error || 'request failed']);
        return;
      }
      setDone(data.show);
      setForm(EMPTY);
      onAdded?.(data.show);
    } catch (err) {
      setErrors([err.message || 'network error']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span>Add show</span>
          <button onClick={onClose} style={{ border: 'none', fontSize: 16 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal__body">
          <Field label="Name *" required>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Start *" required>
              <input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} required />
            </Field>
            <Field label="End">
              <input type="date" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="City">
              <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field label="Country *" required>
              <input type="text" value={form.country} onChange={(e) => update('country', e.target.value)} required />
            </Field>
          </div>
          <Field label="Venue">
            <input type="text" value={form.venue} onChange={(e) => update('venue', e.target.value)} />
          </Field>
          <Field label="Website">
            <input type="url" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://…" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Attendees">
              <input type="number" min="0" value={form.attendees} onChange={(e) => update('attendees', e.target.value)} />
            </Field>
            <Field label="Exhibitors">
              <input type="number" min="0" value={form.exhibitors} onChange={(e) => update('exhibitors', e.target.value)} />
            </Field>
          </div>
          <Field label="Industry">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
              {INDUSTRY_SEGMENTS.map((seg) => (
                <label key={seg} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.industries.includes(seg)}
                    onChange={() => toggleIndustry(seg)}
                  />
                  <span>{seg}</span>
                </label>
              ))}
            </div>
            <input
              type="text"
              value={form.industryOther}
              onChange={(e) => update('industryOther', e.target.value)}
              placeholder="Other (comma-separated)"
              style={{ marginTop: 6 }}
            />
          </Field>
          <Field label="Added by (your name)">
            <input type="text" value={form.added_by} onChange={(e) => update('added_by', e.target.value)} placeholder="Mikael" />
          </Field>
          <Field label="Notes">
            <textarea rows="2" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </Field>

          {errors && (
            <div style={{ color: 'var(--red)', fontSize: 11, padding: 6, border: '1px solid var(--red)', marginTop: 6 }}>
              {errors.map((e, i) => <div key={i}>· {e}</div>)}
            </div>
          )}
          {done && (
            <div style={{ color: 'var(--green)', fontSize: 11, padding: 6, marginTop: 6 }}>
              ✓ Added "{done.name}" — visible to everyone now.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={onClose}>Close</button>
            <button type="submit" disabled={submitting} style={{ color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}>
              {submitting ? 'Saving…' : 'Add show'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}
