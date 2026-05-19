import { useEffect, useMemo, useState } from 'react';
import './App.css';
import showsData from './data/shows.json';
import { StatsBar } from './components/StatsBar';
import { FilterSidebar } from './components/FilterSidebar';
import { ShowTable } from './components/ShowTable';
import { AddShowForm } from './components/AddShowForm';
import { useFlagged } from './hooks/useFlagged';
import { isInDateRange, isInISOWeek } from './utils/dateUtils';
import { REGIONS } from './utils/regions';
import { INDUSTRY_SEGMENTS } from './utils/industries';

const INDUSTRY_CANON = new Set(INDUSTRY_SEGMENTS);

const EUROPE_MAIN_COUNTRIES = REGIONS.find((r) => r.id === 'europe-main')?.countries || [];

const INITIAL_FILTERS = {
  countries: new Set(EUROPE_MAIN_COUNTRIES),
  venues: new Set(),
  industries: new Set(),
  audiences: new Set(['b2b']),
  sources: new Set(),
  query: '',
  minAttendees: '',
  dateFrom: '',
  dateTo: '',
  week: '',
  weekYear: '',
  flaggedOnly: false,
  scan2leadOnly: false,
};

function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState({ key: 'start_date', dir: 'asc' });
  const { flags, cycle } = useFlagged();
  const [manualShows, setManualShows] = useState([]);
  const [industryOverrides, setIndustryOverrides] = useState({});
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    fetch('/api/manual-shows')
      .then((r) => (r.ok ? r.json() : { shows: [] }))
      .then((d) => setManualShows(d.shows || []))
      .catch(() => setManualShows([]));
    fetch('/api/industry-overrides')
      .then((r) => (r.ok ? r.json() : { overrides: {} }))
      .then((d) => setIndustryOverrides(d.overrides || {}))
      .catch(() => setIndustryOverrides({}));
  }, []);

  const allShows = useMemo(() => {
    // Manual shows take priority on ID collisions; industry overrides replace
    // the show's canonical-segment portion of `industry`.
    const map = new Map(showsData.shows.map((s) => [s.id, s]));
    for (const s of manualShows) map.set(s.id, s);
    if (Object.keys(industryOverrides).length === 0) return [...map.values()];
    return [...map.values()].map((s) => {
      const override = industryOverrides[s.id];
      if (!override) return s;
      // Keep non-canonical (raw) industry tags, replace canonical ones with override
      const nonCanonical = (s.industry || []).filter((t) => !INDUSTRY_CANON.has(t));
      return { ...s, industry: [...nonCanonical, ...override] };
    });
  }, [manualShows, industryOverrides]);

  function handleIndustryChange(showId, newIndustry) {
    setIndustryOverrides((prev) => {
      const next = { ...prev };
      if (newIndustry === null) delete next[showId];
      else next[showId] = newIndustry;
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const minAtt = filters.minAttendees ? parseInt(filters.minAttendees, 10) : null;
    const out = allShows.filter((s) => {
      if (filters.countries.size > 0 && !filters.countries.has(s.country)) return false;
      if (filters.venues.size > 0 && !filters.venues.has(s.venue)) return false;
      if (filters.industries.size > 0) {
        const tags = Array.isArray(s.industry) ? s.industry : [];
        if (!tags.some((t) => filters.industries.has(t))) return false;
      }
      if (filters.audiences.size > 0) {
        const aud = s.audience || 'unknown';
        if (!filters.audiences.has(aud)) return false;
      }
      if (filters.sources.size > 0) {
        const tokens = (s.source || '').split('+');
        if (!tokens.some((t) => filters.sources.has(t))) return false;
      }
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (minAtt != null && (s.attendees == null || s.attendees < minAtt)) return false;
      if (!isInDateRange(s.start_date, s.end_date, filters.dateFrom, filters.dateTo)) return false;
      if (filters.week && filters.weekYear) {
        const wk = parseInt(filters.week, 10);
        const yr = parseInt(filters.weekYear, 10);
        if (Number.isFinite(wk) && Number.isFinite(yr) && !isInISOWeek(s.start_date, s.end_date, yr, wk)) return false;
      }
      if (filters.flaggedOnly && !flags[s.id]) return false;
      if (filters.scan2leadOnly && !s.scan2lead) return false;
      return true;
    });

    out.sort((a, b) => {
      const k = sort.key;
      let va, vb;
      if (k === 'industry') {
        // Sort by first canonical segment; empty sorts last
        va = (Array.isArray(a.industry) ? a.industry : []).find((t) => INDUSTRY_CANON.has(t)) || '';
        vb = (Array.isArray(b.industry) ? b.industry : []).find((t) => INDUSTRY_CANON.has(t)) || '';
      } else {
        va = a[k]; vb = b[k];
      }
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1;
      if (vb == null || vb === '') return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [allShows, filters, sort, flags]);

  function handleAdded(show) {
    setManualShows((prev) => {
      const without = prev.filter((s) => s.id !== show.id);
      return [...without, show];
    });
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          eXpotential Calendar
          <span className="dim">— global trade show database</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => setFormOpen(true)} style={{ color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}>+ Add show</button>
          <div className="app__meta">
            {allShows.length.toLocaleString()} shows
            {manualShows.length > 0 && <span style={{ color: 'var(--accent)' }}> · {manualShows.length} manual</span>}
          </div>
        </div>
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          <FilterSidebar allShows={allShows} filters={filters} setFilters={setFilters} />
        </aside>
        <main className="app__main">
          <StatsBar filtered={filtered} total={allShows.length} refreshedAt={showsData.source_scraped_at} />
          <ShowTable
            shows={filtered}
            sort={sort}
            setSort={setSort}
            flags={flags}
            onFlag={cycle}
            industryOverrides={industryOverrides}
            onIndustryChange={handleIndustryChange}
          />
        </main>
      </div>
      {formOpen && <AddShowForm onClose={() => setFormOpen(false)} onAdded={handleAdded} />}
    </div>
  );
}

export default App;
