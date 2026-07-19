// fetch wrapper for mutating API calls. The server may require a shared
// write token (x-write-token header, checked against the WRITE_TOKEN env var
// on Vercel — see api/_lib/auth.js). The token is only ever held in
// localStorage, never in the bundle: on the first 401 the user is prompted
// once and the request is retried.

const TOKEN_KEY = 'expotential-calendar.write-token';

function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export async function writeFetch(url, opts = {}, { silent = false } = {}) {
  const doFetch = (token) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
        ...(token ? { 'x-write-token': token } : {}),
      },
    });

  let res = await doFetch(storedToken());
  if (res.status === 401 && !silent) {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    const entered = (window.prompt('This action needs the team write token — ask a teammate for it:') || '').trim();
    if (entered) {
      try { localStorage.setItem(TOKEN_KEY, entered); } catch { /* session-only */ }
      res = await doFetch(entered);
    }
  }
  return res;
}
