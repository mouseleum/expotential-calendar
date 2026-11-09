// One cell in the "List" column: queue an exhibitor-list run for a show and
// show how it's going. When the CSV is in Supabase Storage the finished chip is
// a download link (with ↻ next to it to run again); a CSV saved only on a local
// worker shows its path in the tooltip instead.

function downloadHref(showId) {
  return `/api/exhibitor-jobs?download=${encodeURIComponent(showId)}`;
}

function describe(job) {
  if (!job) return { label: '⇩', state: '', title: 'Get the exhibitor list (CSV)' };
  const where = job.outputPath && !job.downloadable ? `\nSaved to: ${job.outputPath}` : '';
  const cost = job.costUsd != null ? ` · $${job.costUsd.toFixed(2)}` : '';
  const again = '\nClick to run again.';
  switch (job.status) {
    case 'pending':
      return { label: '…', state: 'pending', title: 'Queued — waiting for the exhibitor agent to pick it up' };
    case 'claimed':
      return { label: '⟳', state: 'running', title: `Running on ${job.workerId || 'the agent'}…` };
    case 'done':
      return {
        label: `✓ ${job.count ?? ''}`.trim(),
        state: 'done',
        title: `${job.count ?? 0} exhibitors${cost}${where}${again}`,
      };
    case 'needs_review':
      return {
        label: `! ${job.count ?? ''}`.trim(),
        state: 'review',
        title: `Partial list — ${job.error || 'check the CSV'}${cost}${where}${again}`,
      };
    case 'failed':
    case 'rejected':
      return { label: '✕', state: 'failed', title: `Failed: ${job.error || 'unknown error'}${again}` };
    default:
      return { label: '?', state: '', title: `Status unknown (${job.status})${again}` };
  }
}

export function ExhibitorJobButton({ showId, job, onRequest }) {
  const { label, state, title } = describe(job);
  const busy = state === 'pending' || state === 'running';
  if (job?.downloadable && (state === 'done' || state === 'review')) {
    const dlTitle = title.replace('\nClick to run again.', '\nTap to download the CSV.');
    return (
      <span className="exh-job-cell">
        <a className="exh-job-btn" data-state={state} href={downloadHref(showId)} title={dlTitle} aria-label={dlTitle}>
          {label} ⇩
        </a>
        <button type="button" className="exh-job-rerun" onClick={onRequest} title="Run again" aria-label="Run again">↻</button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="exh-job-btn"
      data-state={state}
      disabled={busy}
      onClick={onRequest}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
}
