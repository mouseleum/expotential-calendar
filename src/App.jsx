import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { StatsBar } from './components/StatsBar';
import { FilterSidebar } from './components/FilterSidebar';
import { ShowTable } from './components/ShowTable';
import { AddShowForm } from './components/AddShowForm';
import { CalendarView } from './components/CalendarView';
import { ChangelogPanel } from './components/ChangelogPanel';
import { filtersToParam, filtersFromParam } from './utils/urlState';
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
  // Default to the current month — with no lower bound the ascending date
  // sort would open the table on long-past shows.
  dateFrom: new Date().toISOString().slice(0, 7),
  dateTo: '',
  week: '',
  weekYear: '',
  flaggedOnly: false,
  scan2leadOnly: false,
  majorCitiesOnly: false,
};

function App() {
  // Filter + view state round-trips through the URL (?f=…&v=cal) so any view
  // can be shared as a link; see src/utils/urlState.js.
  const [filters, setFilters] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return filtersFromParam(params.get('f')) || INITIAL_FILTERS;
  });
  const [view, setView] = useState(() =>
    new URLSearchParams(window.location.search).get('v') === 'cal' ? 'calendar' : 'table');
  const [sort, setSort] = useState({ key: 'start_date', dir: 'asc' });
  const { flags, cycle } = useFlagged();
  // shows.json is served from /public/ at runtime instead of being bundled
  // into the JS — keeps the initial JS chunk small. null = not yet loaded.
  const [showsData, setShowsData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [manualShows, setManualShows] = useState([]);
  const [industryOverrides, setIndustryOverrides] = useState({});
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    fetch('/shows.json')
      .then((r) => {
        if (!r.ok) throw new Error(`shows.json ${r.status}`);
        return r.json();
      })
      .then((d) => setShowsData(d))
      .catch((err) => setLoadError(err.message));
    fetch('/api/manual-shows')
      .then((r) => (r.ok ? r.json() : { shows: [] }))
      .then((d) => setManualShows(d.shows || []))
      .catch(() => setManualShows([]));
    fetch('/api/industry-overrides')
      .then((r) => (r.ok ? r.json() : { overrides: {} }))
      .then((d) => setIndustryOverrides(d.overrides || {}))
      .catch(() => setIndustryOverrides({}));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      const f = filtersToParam(filters, INITIAL_FILTERS);
      if (f) params.set('f', f);
      if (view === 'calendar') params.set('v', 'cal');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [filters, view]);

  const allShows = useMemo(() => {
    // Manual shows take priority on ID collisions; industry overrides replace
    // the show's canonical-segment portion of `industry`.
    const map = new Map((showsData?.shows ?? []).map((s) => [s.id, s]));
    // Manual shows are never auto-tagged major_city by the pipeline — treat
    // them as major by default so "Major cities only" never hides a show
    // someone deliberately added.
    for (const s of manualShows) map.set(s.id, { major_city: true, ...s });
    if (Object.keys(industryOverrides).length === 0) return [...map.values()];
    return [...map.values()].map((s) => {
      const override = industryOverrides[s.id];
      if (!override) return s;
      // Keep non-canonical (raw) industry tags, replace canonical ones with override
      const nonCanonical = (s.industry || []).filter((t) => !INDUSTRY_CANON.has(t));
      return { ...s, industry: [...nonCanonical, ...override] };
    });
  }, [showsData, manualShows, industryOverrides]);

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
      if (filters.majorCitiesOnly && !s.major_city) return false;
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

  function showWeekInTable(year, week) {
    setFilters((prev) => ({ ...prev, week: String(week), weekYear: String(year), dateFrom: '', dateTo: '' }));
    setView('table');
  }

  function findShowByName(name) {
    setFilters((prev) => ({ ...prev, query: name, dateFrom: '', dateTo: '', week: '', weekYear: '' }));
    setView('table');
  }

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
          <ChangelogPanel onShowClick={findShowByName} />
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
          {loadError && <div className="empty" style={{ color: 'var(--red)' }}>Failed to load shows: {loadError}</div>}
          {!loadError && !showsData && <div className="empty">Loading…</div>}
          <StatsBar filtered={filtered} total={allShows.length} refreshedAt={showsData?.source_scraped_at} view={view} setView={setView} />
          {view === 'calendar' ? (
            <CalendarView
              shows={filtered}
              flags={flags}
              initialMonth={filters.dateFrom ? filters.dateFrom.slice(0, 7) : ''}
              onWeekSelect={showWeekInTable}
            />
          ) : (
            <ShowTable
              shows={filtered}
              sort={sort}
              setSort={setSort}
              flags={flags}
              onFlag={cycle}
              industryOverrides={industryOverrides}
              onIndustryChange={handleIndustryChange}
            />
          )}
        </main>
      </div>
      {formOpen && <AddShowForm onClose={() => setFormOpen(false)} onAdded={handleAdded} />}
    </div>
  );
}

export default App;
