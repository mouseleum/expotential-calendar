import { useMemo, useState } from 'react';
import './App.css';
import showsData from './data/shows.json';
import { StatsBar } from './components/StatsBar';
import { FilterSidebar } from './components/FilterSidebar';
import { ShowTable } from './components/ShowTable';
import { useFlagged } from './hooks/useFlagged';
import { isInDateRange, isInISOWeek } from './utils/dateUtils';
import { REGIONS } from './utils/regions';

const EUROPE_MAIN_COUNTRIES = REGIONS.find((r) => r.id === 'europe-main')?.countries || [];

const INITIAL_FILTERS = {
  countries: new Set(EUROPE_MAIN_COUNTRIES),
  venues: new Set(),
  query: '',
  minAttendees: '',
  dateFrom: '',
  dateTo: '',
  week: '',
  weekYear: '',
  flaggedOnly: false,
};

function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState({ key: 'start_date', dir: 'asc' });
  const { flags, cycle } = useFlagged();

  const allShows = showsData.shows;

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const minAtt = filters.minAttendees ? parseInt(filters.minAttendees, 10) : null;
    const out = allShows.filter((s) => {
      if (filters.countries.size > 0 && !filters.countries.has(s.country)) return false;
      if (filters.venues.size > 0 && !filters.venues.has(s.venue)) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (minAtt != null && (s.attendees == null || s.attendees < minAtt)) return false;
      if (!isInDateRange(s.start_date, s.end_date, filters.dateFrom, filters.dateTo)) return false;
      if (filters.week && filters.weekYear) {
        const wk = parseInt(filters.week, 10);
        const yr = parseInt(filters.weekYear, 10);
        if (Number.isFinite(wk) && Number.isFinite(yr) && !isInISOWeek(s.start_date, s.end_date, yr, wk)) return false;
      }
      if (filters.flaggedOnly && !flags[s.id]) return false;
      return true;
    });

    out.sort((a, b) => {
      const k = sort.key;
      const va = a[k]; const vb = b[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [allShows, filters, sort, flags]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          eXpotential Calendar
          <span className="dim">— global trade show database</span>
        </div>
        <div className="app__meta">
          {showsData.count.toLocaleString()} shows / {showsData.countries} countries
        </div>
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          <FilterSidebar allShows={allShows} filters={filters} setFilters={setFilters} />
        </aside>
        <main className="app__main">
          <StatsBar filtered={filtered} total={allShows.length} refreshedAt={showsData.source_scraped_at} />
          <ShowTable shows={filtered} sort={sort} setSort={setSort} flags={flags} onFlag={cycle} />
        </main>
      </div>
    </div>
  );
}

export default App;
