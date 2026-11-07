import { useCallback, useEffect, useState } from 'react';
import { writeFetch } from '../utils/api';

// Exhibitor-list jobs per show, backed by /api/exhibitor-jobs.
// Shape: { [showId]: { status, count, outputPath, error, url, ... } }.
// Polls every 10s, but only while some job is waiting or running.

const POLL_MS = 10_000;
const ACTIVE = new Set(['pending', 'claimed']);

export function isActiveJob(job) {
  return !!job && ACTIVE.has(job.status);
}

export function useExhibitorJobs() {
  const [jobs, setJobs] = useState({});
  const [available, setAvailable] = useState(false); // true once the API answers; hides the column otherwise
  const anyActive = Object.values(jobs).some(isActiveJob);

  // Initial load, then a poll loop while anything is pending or running.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/exhibitor-jobs');
        if (cancelled) return;
        if (r.status === 404 || r.status === 503) {
          setAvailable(false); // API not deployed or not configured: hide the column
          return;
        }
        if (!r.ok) return;
        const body = await r.json();
        if (cancelled) return;
        setAvailable(true);
        setJobs(body.jobs || {});
      } catch { /* offline — keep what we have */ }
    }
    load();
    const id = anyActive ? setInterval(load, POLL_MS) : null;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [anyActive]);

  // Asks for the exhibitor-list URL (prefilled with the last one used, else the
  // show's website) and queues a run.
  const request = useCallback(async (show) => {
    const current = jobs[show.id];
    if (isActiveJob(current)) return;
    const suggested = current?.url || show.website || '';
    const url = (window.prompt(
      `Exhibitor list page for ${show.name}\n(the page that lists the exhibitors, not just the show's home page):`,
      suggested,
    ) || '').trim();
    if (!url) return;

    const res = await writeFetch('/api/exhibitor-jobs', {
      method: 'POST',
      body: JSON.stringify({
        showId: show.id,
        showName: show.name,
        year: show.start_date ? Number(show.start_date.slice(0, 4)) : null,
        url,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok || res.status === 409) {
      if (body.job) setJobs((prev) => ({ ...prev, [show.id]: body.job }));
      if (res.status === 409) alert(body.error);
      return;
    }
    alert(`Could not queue the exhibitor run: ${body.error || `HTTP ${res.status}`}`);
  }, [jobs]);

  return { jobs, available, request };
}
