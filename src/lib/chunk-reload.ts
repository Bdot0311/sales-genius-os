// Self-heal stale chunk references after a redeploy. When a dynamic import
// fails because the hashed chunk URL no longer exists, reload the page with a
// cache-busting query param so the browser/proxy re-fetches a fresh index.html
// (and therefore the new chunk manifest) instead of re-serving a stale cached
// document. Up to 3 attempts inside a 30s window, then we stop and let the
// error boundary show its manual-refresh screen.
const CHUNK_RELOAD_KEY = "__chunk_reload_attempt__";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const MAX_ATTEMPTS = 3;

export const isChunkLoadErrorMessage = (msg: string) =>
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError/i.test(
    msg
  );

export function recoverFromStaleChunk(): void {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const prev = raw ? (JSON.parse(raw) as { at: number; n: number }) : { at: 0, n: 0 };
    const n = now - prev.at < CHUNK_RELOAD_WINDOW_MS ? prev.n : 0;
    if (n >= MAX_ATTEMPTS) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ at: now, n: n + 1 }));
    const url = new URL(window.location.href);
    url.searchParams.set("__cr", String(now));
    window.location.replace(url.toString());
    return;
  } catch {
    /* fall through to plain reload */
  }
  window.location.reload();
}

// Called once the app has mounted successfully — reset the attempt counter so
// a future chunk error later in the session gets a fresh set of retries.
export function clearStaleChunkFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {}
}
