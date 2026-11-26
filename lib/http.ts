// The only place in Chaperone that performs an outbound request.
// PROJECT-PLAN.md §5.3 (etiquette) and §5.4 (failure philosophy).

import * as cache from './cache';

const VERSION = '0.1.0';

/**
 * §5.3: identify ourselves on every request.
 *
 * §10.8 is settled: the contact address is the deployed site — public, stable
 * across redeploys, and account-neutral. It is read from the environment and
 * never written here, because the value differs per deployment and because the
 * long per-account Vercel URL embeds the operator's account handle, which has
 * no business being sent to eighteen third parties (see .env.example).
 *
 * The 'TBD' fallback is kept DELIBERATELY. A deployment with the variable
 * unset is misconfigured, and the honest thing is to say so in the one place
 * an upstream administrator will look, rather than to invent a contact address
 * that resolves nowhere. verify:criteria warns when it sees this value.
 */
function userAgent(): string {
  const contact = process.env.CHAPERONE_CONTACT_URL || 'TBD';
  return `Chaperone/${VERSION} (+${contact})`;
}

/**
 * Every outbound attempt this process has made, counting retries.
 *
 * Criterion 12 is "a repeated identical query inside the TTL makes ZERO
 * upstream requests, verifiable in logs". The `cached` flag on each panel is
 * evidence of that but not proof: it reports what the cache layer believes,
 * which is the very thing under test. This counter sits at the one place a
 * request can actually leave the process, so a second identical query that
 * moves it by zero is proof rather than self-report.
 *
 * Read through /api/diag, which is dev-only.
 */
let outboundAttempts = 0;

export function outboundAttemptCount(): number {
  return outboundAttempts;
}

/**
 * Provenance of an answer that is NOT data.
 *
 * "This source has no record" is itself a finding (§5.4), so it carries the
 * same freshness question as a value: an absence confirmed an hour ago and
 * served from cache must not be presented as confirmed just now. Attached to
 * the error so a connector that throws still reports honestly — the panel
 * route previously hardcoded `fetchedAt: now, cached: false` on every error
 * path, which is the same fabrication that was removed from the connectors.
 *
 * Absent when nothing was fetched at all — a connector rejecting a subject on
 * its own `requires` has no upstream answer to date, and "now" is then correct.
 */
export interface Provenance {
  fetchedAt: number;
  cached: boolean;
}

/** Thrown when a source answers, correctly, that it has nothing. Maps to state 'empty'. */
export class NoEntry extends Error {
  readonly provenance?: Provenance;
  constructor(message = 'No entry in this source', provenance?: Provenance) {
    super(message);
    this.name = 'NoEntry';
    this.provenance = provenance;
  }
}

/** Thrown when the source could not be reached or failed. Maps to state 'unavailable'. */
export class Unavailable extends Error {
  readonly provenance?: Provenance;
  constructor(message: string, provenance?: Provenance) {
    super(message);
    this.name = 'Unavailable';
    this.provenance = provenance;
  }
}

/** Reads provenance off a thrown value, if it carries any. */
export function provenanceOf(e: unknown): Provenance | undefined {
  if (e instanceof NoEntry || e instanceof Unavailable) return e.provenance;
  return undefined;
}

export interface FetchOptions {
  timeoutMs: number;
  ttlMs?: number;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * HTTP statuses that mean "this source has no record", not "this failed".
   * Gate 1: the GWAS Catalog returns 404 for an rsID with no catalogued
   * association. That is an answer, not an error (§5.4).
   */
  emptyOn?: number[];
  /** Identifies the caller to STRING, which requires it. */
  cacheKey?: string;
}

export interface FetchResult<T> {
  json: T;
  cached: boolean;
  fetchedAt: number;
}

/**
 * What gets cached for an `emptyOn` status.
 *
 * A marker rather than a value, so a cache hit on a known-absent record can
 * raise NoEntry again instead of handing back something that would be read as
 * a record. The key is an unlikely string so no real API payload collides.
 */
const EMPTY_KEY = '__chaperone_no_entry__';

interface EmptyMarker {
  [EMPTY_KEY]: true;
  status: number;
}

function emptyMarker(status: number): EmptyMarker {
  return { [EMPTY_KEY]: true, status };
}

function isEmptyMarker(v: unknown): v is EmptyMarker {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)[EMPTY_KEY] === true
  );
}

/**
 * Statuses that are shaped like an absence but can also be a refusal.
 *
 * §11.7 / the M8 finding: EBI sheds load with **404, not 429**. Four of our
 * connectors query `ebi.ac.uk` directly and ten pass `emptyOn: [404]`, so a
 * throttled request arrives looking exactly like "this source has no record
 * for this subject" — the one claim §5.4 exists to protect. Observed on
 * 2026-11-09: two IntAct record URLs returned 404 under the criteria run's own
 * load and served 200 seconds later.
 *
 * 204 is deliberately NOT here. A source answering "no content" has answered;
 * nothing is ambiguous about it, and re-asking would be waste.
 */
const CONFIRM_ABSENCE_STATUSES = new Set([404, 410]);

/**
 * How long to wait before asking again.
 *
 * Long enough for a load-shedding window to pass — the same 2.5 s the deep-link
 * checker uses, chosen there because the 404s it saw cleared within seconds.
 * Short enough that a genuine absence, which is the common case, costs one
 * noticeable pause and nothing more. The confirmed result is cached either way,
 * so a subject pays this at most once per TTL.
 */
const CONFIRM_ABSENCE_DELAY_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One outbound attempt. The only place a request leaves the process. */
async function requestOnce(url: string, opts: FetchOptions): Promise<Response> {
  outboundAttempts++;
  return fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'user-agent': userAgent(),
      accept: 'application/json',
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
}

type Confirmation =
  | { kind: 'absent'; status: number; confirmed: boolean }
  | { kind: 'recovered'; res: Response }
  | { kind: 'unavailable'; message: string };

/**
 * Ask once more before concluding that a source has nothing.
 *
 * This is the difference between "the source told us there is no record" and
 * "we were refused in a way that looks like there is no record". Chaperone's
 * whole claim is that an absence is a finding, and a finding we did not
 * establish is the worst thing this project can print.
 *
 * Three outcomes, and the middle one is why this exists:
 *   · absent      — asked twice, told the same thing twice. Now it is a finding.
 *   · recovered   — the second request succeeded. The first was a refusal, and
 *                   the researcher gets their data instead of a false absence.
 *   · unavailable — could not confirm. We do not know, so we do not claim.
 *
 * The cost is one extra request and one delay per absent subject per TTL. Under
 * throttling it adds a little load to a host already shedding it, which is the
 * price of not making a claim we cannot support; §5.3 is satisfied because it
 * is one request after a wait, never a loop.
 */
async function confirmAbsence(url: string, opts: FetchOptions, firstStatus: number): Promise<Confirmation> {
  if (!CONFIRM_ABSENCE_STATUSES.has(firstStatus)) {
    // 204 and anything else a connector nominated: unambiguous by construction.
    return { kind: 'absent', status: firstStatus, confirmed: false };
  }

  await sleep(CONFIRM_ABSENCE_DELAY_MS);

  let res: Response;
  try {
    res = await requestOnce(url, opts);
  } catch (e) {
    const name = (e as Error)?.name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      kind: 'unavailable',
      message: `${firstStatus}, and the confirming request ${timedOut ? 'timed out' : 'failed'} — absence not established`,
    };
  }

  if (res.status === firstStatus || opts.emptyOn?.includes(res.status)) {
    return { kind: 'absent', status: res.status, confirmed: true };
  }
  if (res.ok) return { kind: 'recovered', res };

  return {
    kind: 'unavailable',
    message: `${firstStatus}, then HTTP ${res.status} on confirmation — absence not established`,
  };
}

/**
 * Fetch JSON with cache, timeout, one retry, and the four-state mapping.
 *
 * Retries exactly once on a network-level failure, never on an HTTP status
 * (§5.3 "never retry in a loop"). A 5xx is a decision by the server; hammering
 * it is not our place. The one exception is an absence-shaped status, which is
 * asked again once — see `confirmAbsence`, and note that this is not a retry
 * for success but a second witness for a claim.
 */
export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<FetchResult<T>> {
  const key = opts.cacheKey ?? `${opts.method ?? 'GET'} ${url} ${opts.body ? JSON.stringify(opts.body) : ''}`;

  const hit = cache.get<T | EmptyMarker>(key);
  if (hit) {
    if (isEmptyMarker(hit.value)) {
      throw new NoEntry(`${hit.value.status} — source has no record for this subject`, {
        fetchedAt: hit.fetchedAt,
        cached: true,
      });
    }
    return { json: hit.value as T, cached: true, fetchedAt: hit.fetchedAt };
  }

  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await requestOnce(url, opts);
    } catch (e) {
      lastNetworkError = e;
      const code = (e as { cause?: { code?: string } })?.cause?.code;
      const name = (e as Error)?.name;
      const timedOut = name === 'TimeoutError' || name === 'AbortError';

      // A timeout is not a transient blip — it is the source saying it is
      // slower than our budget, and retrying it simply spends the budget
      // twice. Measured: a 4s speculative ChEMBL probe became 8s because of
      // this, pushing one resolution past 10s. Retry genuine connection
      // failures only (§5.3, one retry).
      if (attempt === 0 && !timedOut) continue;

      throw new Unavailable(
        timedOut ? `timed out after ${opts.timeoutMs}ms` : `network error${code ? ` (${code})` : ''}`,
      );
    }

    if (opts.emptyOn?.includes(res.status)) {
      // An absence is a finding, so it needs a second witness before it is
      // reported as one. See `confirmAbsence` — this is the §11.7 fix.
      const verdict = await confirmAbsence(url, opts, res.status);

      if (verdict.kind === 'unavailable') {
        // NOT cached, and NOT 'empty'. We failed to establish anything, and
        // "we do not know" is a different answer from "there is nothing".
        throw new Unavailable(verdict.message);
      }

      if (verdict.kind === 'absent') {
        // The absence is cached like any other answer. It IS the answer (§5.4),
        // so re-asking the source every time would be both slower and rude
        // (§5.3) — and it is cached through a marker rather than as a value, so
        // a cache hit can still raise NoEntry instead of returning a fake record.
        const fetchedAt = cache.set(key, emptyMarker(verdict.status), opts.ttlMs);
        throw new NoEntry(
          `${verdict.status} — source has no record for this subject${verdict.confirmed ? ' (asked twice)' : ''}`,
          { fetchedAt, cached: false },
        );
      }

      // Recovered: the first 404 was a refusal, not an answer. Carry on with
      // the response that actually arrived — the researcher gets their data
      // instead of a panel claiming a record does not exist.
      res = verdict.res;
    }

    // Deliberately NOT cached. A 5xx or a timeout is transient; storing it
    // would turn one bad minute at the source into an hour of false failure.
    if (!res.ok) {
      throw new Unavailable(`HTTP ${res.status}`);
    }

    const text = await res.text();
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      // An HTML error page behind a 200 is a failure, not data.
      throw new Unavailable('response was not JSON');
    }

    // Report the instant the cache recorded, not a fresh clock read, so this
    // response and the next cached one agree. See cache.set().
    const fetchedAt = cache.set(key, json, opts.ttlMs);
    return { json, cached: false, fetchedAt };
  }

  throw new Unavailable(`unreachable: ${String(lastNetworkError)}`);
}

/**
 * Accumulates fetch provenance across the calls one connector makes, so a
 * panel reports when its data was actually retrieved instead of asserting it
 * is fresh.
 *
 * §5.4 forbids presenting a cached value as live. Every M3 connector initially
 * hard-coded `cached: false, fetchedAt: now`, which meant an hour-old cached
 * response was displayed with the current time beside it — the rule broken in
 * exactly the way it was written to prevent.
 *
 * A connector making several calls is cached only if every call was, and its
 * timestamp is the oldest of them: the panel is no fresher than its stalest
 * component.
 */
export class FetchMeta {
  private oldest = Number.POSITIVE_INFINITY;
  private allCached = true;
  private any = false;

  record<T>(result: FetchResult<T>): FetchResult<T> {
    this.any = true;
    this.oldest = Math.min(this.oldest, result.fetchedAt);
    this.allCached = this.allCached && result.cached;
    return result;
  }

  get(): { fetchedAt: string; cached: boolean } {
    if (!this.any) return { fetchedAt: new Date().toISOString(), cached: false };
    return { fetchedAt: new Date(this.oldest).toISOString(), cached: this.allCached };
  }

  /**
   * The same provenance in the numeric form the error classes take, for a
   * connector that fetched successfully and then found the payload held
   * nothing useful. That absence is as old as the response it was read from,
   * so it must be reported with the response's timestamp, not with "now".
   * Returns undefined when nothing was fetched, which is the honest answer.
   */
  provenance(): Provenance | undefined {
    if (!this.any) return undefined;
    return { fetchedAt: this.oldest, cached: this.allCached };
  }
}

/** Convert whatever a connector threw into the right panel state (§5.4). */
export function toState(e: unknown): { state: 'empty' | 'unavailable'; message: string } {
  if (e instanceof NoEntry) return { state: 'empty', message: e.message };
  if (e instanceof Unavailable) return { state: 'unavailable', message: e.message };
  return { state: 'unavailable', message: e instanceof Error ? e.message : String(e) };
}
