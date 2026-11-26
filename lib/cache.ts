// In-process TTL cache. PROJECT-PLAN.md §5.3: identical lookups inside the TTL
// must not hit upstream again.
//
// Deliberately in-memory: a single-process dev server and a modest deployment
// both work, and there is no user data here to persist. §11.7 asks whether a
// shared cache is needed before public launch; swap this module's internals
// then, not its interface.

interface Entry {
  value: unknown;
  /** When the upstream fetch happened, so panels can say how stale a value is. */
  fetchedAt: number;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/** Hard ceiling so a long-running process cannot grow without bound. */
const MAX_ENTRIES = 2000;

export const TTL = {
  /** Reference data that changes on a release cadence, not daily. */
  long: 24 * 60 * 60 * 1000,
  /** Default for most lookups (§5.3). */
  standard: 60 * 60 * 1000,
  /** Anything we expect to move. */
  short: 5 * 60 * 1000,
} as const;

export function get<T>(key: string): { value: T; fetchedAt: number } | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return { value: hit.value as T, fetchedAt: hit.fetchedAt };
}

/**
 * Stores the value and returns the instant recorded as its `fetchedAt`.
 *
 * The return value is the point: the caller must report THIS instant as the
 * response's timestamp rather than reading the clock again. Measured during
 * M3 — a second `Date.now()` after `set` put the fresh response 1ms ahead of
 * the cache entry, so the next (cached) read appeared to move time backwards.
 * One clock read, used in both places, makes that impossible.
 */
export function set(key: string, value: unknown, ttlMs: number = TTL.standard): number {
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest-inserted. Map preserves insertion order.
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  const now = Date.now();
  store.set(key, { value, fetchedAt: now, expiresAt: now + ttlMs });
  return now;
}

/** Test and diagnostics only. */
export function stats() {
  return { entries: store.size, max: MAX_ENTRIES };
}

export function clear(): void {
  store.clear();
}
