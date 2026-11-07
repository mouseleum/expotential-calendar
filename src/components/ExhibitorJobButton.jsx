// One cell in the "List" column: queue an exhibitor-list run for a show and
// show how it's going. The agent itself runs on a local machine and saves the
// CSV there; the path is shown in the tooltip once it's done.

function describe(job) {
  if (!job) return { label: '⇩', state: '', title: 'Get the exhibitor list (CSV)' };
  const where = job.outputPath ? `\nSaved to: ${job.outputPath}` : '';
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

export function ExhibitorJobButton({ job, onRequest }) {
  const { label, state, title } = describe(job);
  const busy = state === 'pending' || state === 'running';
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
