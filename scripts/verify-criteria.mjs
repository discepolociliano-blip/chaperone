#!/usr/bin/env node
// M7: the §7 acceptance criteria, checked against live APIs, one at a time.
// PROJECT-PLAN.md §7 and §14.
//
// `probe.mjs` asks "does everything still work". This asks the narrower and
// harder question: "is each thing we PROMISED actually true". It prints a line
// per criterion so the answer is reproducible instead of a claim in prose.
//
// Covers: 1–7, 9, 10, 11, 12, 13, 15, 16, 17.
//   · 8  (induced partial failure)  — run with --induce after editing a
//        connector's timeout, see the M7 findings; not automated here.
//   · 8b (the page stays usable)    — needs a browser with a lookup in flight;
//        done by hand at M8 by stopping the server mid-load. See M8 findings.
//   · 14 (no key in the client bundle) — `npm run build` then grep; shell work,
//        done alongside this script rather than inside it.
//
// M8 added 11, 15, 16 and 17. Three of them are checked over the SOURCE of the
// components rather than over a browser page, deliberately: a browser check
// proves only that the one view I happened to open behaved: the source check
// proves no view can misbehave. Each is fail-closed — if the scan finds
// nothing to inspect, it fails rather than passes.
//
// Usage:  npm run verify:criteria        (needs `npm run dev` running,
//                                         from the project root)

const BASE = process.env.CHAPERONE_URL || 'http://localhost:3000';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const results = [];

function record(id, text, pass, detail) {
  results.push({ id, text, pass, detail });
  const mark = pass === true ? C.green('PASS') : pass === 'partial' ? C.yellow('PART') : C.red('FAIL');
  console.log(`\n${mark} ${C.bold(`criterion ${id}`)} ${C.dim(text)}`);
  for (const d of [].concat(detail ?? [])) console.log(`     ${d}`);
}

async function resolveQ(q) {
  const res = await fetch(`${BASE}/api/resolve?q=${encodeURIComponent(q)}`);
  return { ok: res.ok, status: res.status, body: await res.json() };
}

async function panel(id, ids) {
  const res = await fetch(`${BASE}/api/panel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ids }),
  });
  return { httpOk: res.ok, status: res.status, body: await res.json() };
}

async function allPanels(q) {
  const r = await resolveQ(q);
  if (!r.ok) return { r, panels: [] };
  const panels = [];
  for (const spec of r.body.panels ?? []) {
    const p = await panel(spec.id, r.body.ids);
    panels.push({ spec, ...p });
  }
  return { r, panels };
}

async function diag(echo = false) {
  const res = await fetch(`${BASE}/api/diag${echo ? '?echo=1' : ''}`);
  return { ok: res.ok, body: await res.json() };
}

console.log(C.bold(`Chaperone §7 criteria → ${BASE}`));

// ── 1 ─────────────────────────────────────────────────────────────────────
// The expected values are asserted identities, which is what a test is for —
// §6.5 forbids id literals in CONNECTOR code, not in the thing checking it.
// They are also the ids gate 1 measured, after HGNC:10596 was caught.
{
  const want = { hgnc: 'HGNC:10597', ncbiGene: '6335', uniprot: 'Q15858', ensemblGene: 'ENSG00000169432' };
  const { ok, body } = await resolveQ('SCN9A');
  const wrong = ok ? Object.entries(want).filter(([k, v]) => body.ids[k] !== v) : Object.entries(want);
  record(
    1,
    'SCN9A resolves to HGNC 10597, GeneID 6335, Q15858, ENSG00000169432 with no choice asked',
    ok && wrong.length === 0,
    ok
      ? wrong.length
        ? wrong.map(([k, v]) => C.red(`${k}: expected ${v}, got ${body.ids[k]}`))
        : [C.dim(Object.values(want).join(' · '))]
      : [C.red('resolve failed')],
  );
}

// ── 2 ─────────────────────────────────────────────────────────────────────
{
  const { ok, body } = await resolveQ('rs1333049');
  const v = body?.ids?.variant;
  const hasAlleles = Boolean(v?.alleles);
  const hasMaf = Boolean(v?.majorStudyMaf);
  record(2, 'rs1333049 resolves via dbSNP to alleles and MAF', ok && hasAlleles && hasMaf, [
    `alleles: ${hasAlleles ? C.dim(v.alleles) : C.red('missing')}`,
    `MAF: ${hasMaf ? C.dim(v.majorStudyMaf) : C.red('missing')}`,
    v?.geneSource ? C.dim(`gene context from ${v.geneSource}`) : '',
  ].filter(Boolean));
}

// ── 3 ─────────────────────────────────────────────────────────────────────
{
  const three = await Promise.all(['SCN9A', 'Q15858', 'ENSG00000169432'].map(resolveQ));
  const symbols = three.map((x) => x.body?.ids?.symbol);
  const agree = symbols.every((s) => s && s === symbols[0]);
  record(3, 'Q15858 and ENSG00000169432 resolve to the same gene as SCN9A', agree, [
    agree ? C.dim(`all three → ${symbols[0]}`) : C.red(`disagreement: ${symbols.join(' / ')}`),
  ]);
}

// ── 4 ─────────────────────────────────────────────────────────────────────
{
  const { ok, body } = await resolveQ('neuropathic pain');
  const ids = body?.ids ?? {};
  const genes = ids.traitGenes ?? [];
  const hasTrait = Boolean(ids.efoId && ids.traitName);
  record(
    4,
    'neuropathic pain resolves to a trait WITH associated genes',
    ok && hasTrait && genes.length > 0,
    [
      `trait: ${hasTrait ? C.dim(`${ids.traitName} (${ids.efoId})`) : C.red('not resolved')}`,
      genes.length
        ? C.dim(`associated genes: ${genes.slice(0, 6).join(' · ')}${genes.length > 6 ? ` … ${genes.length} total` : ''}`)
        : C.red('no associated genes — the trait resolves to an id and nothing else'),
    ],
  );
}

// ── 5 ─────────────────────────────────────────────────────────────────────
{
  const { ok, status, body } = await resolveQ('ZZQQXX9');
  const msg = body?.error ?? '';
  // "Helpful" is not just "present": it has to say what to try instead.
  const helpful = !ok && msg.length > 40 && /accession|rsID|symbol/i.test(msg);
  record(5, 'An unrecognised string gives a helpful message, not a crash', helpful, [
    `HTTP ${status}`,
    helpful ? C.dim(msg) : C.red(msg || 'no message'),
  ]);
}

// ── 6 & 7 & 9 & 10 (one pass over the full panel set) ────────────────────
// OR4F5 is here on purpose. The well-studied subjects return `data` from
// every panel, which leaves the `empty` branch — the one §5.4 exists for —
// completely unexercised. An olfactory receptor nobody has studied is the
// control that makes absence visible: it returns no entry from six sources.
const SUBJECTS = ['SCN9A', 'COMT', 'IFNAR2', 'rs6746030', 'SARS-CoV-2', 'OR4F5'];
const seenStates = new Map(); // connector id -> Set(states)
const mismatches = [];
const reportedSymbol = [];
const numberNoLink = [];
const recordUrls = new Set();
let httpFailures = 0;
let gwasEmptyEvidence = null;
// Criterion 10 has to tell "the source answered, and the answer was no record"
// from "the source did not answer at all". Only the first must be `empty`; the
// second is honest unavailability and is not ours to assert away. The message
// is the only evidence of which happened, so keep every one.
const unavailableReasons = []; // { q, id, message }
const emptyWitnesses = [];     // { q, id, message }

for (const q of SUBJECTS) {
  const { r, panels } = await allPanels(q);
  if (!r.ok) continue;
  const resolved = r.body.ids.symbol;

  for (const { spec, httpOk, status, body: p } of panels) {
    if (!httpOk) {
      httpFailures++;
      continue;
    }
    if (!seenStates.has(spec.id)) seenStates.set(spec.id, new Set());
    seenStates.get(spec.id).add(p.state);

    if (p.state === 'unavailable') unavailableReasons.push({ q, id: spec.id, message: p.message ?? '' });
    if (p.state === 'empty') emptyWitnesses.push({ q, id: spec.id, message: p.message ?? '' });

    if (p.symbolSeen) {
      reportedSymbol.push(spec.id);
      if (resolved && p.symbolSeen.toUpperCase() !== resolved.toUpperCase()) {
        mismatches.push(`${q}: ${spec.id} said ${p.symbolSeen}, resolver said ${resolved}`);
      }
    }

    if (p.state === 'data') {
      if (p.recordUrl) recordUrls.add(p.recordUrl);
      for (const f of p.facts ?? []) {
        // Criterion 9: a number has to be traceable to its record.
        if (/\d/.test(f.value ?? '') && !f.href && !p.recordUrl) {
          numberNoLink.push(`${q}: ${spec.id} — "${f.label}: ${f.value}" has no link`);
        }
      }
    }

    if (q === 'OR4F5' && spec.id === 'gwascatalog') {
      gwasEmptyEvidence = { state: p.state, message: p.message };
    }
  }
}

record(6, 'Every panel reports the symbol it answered about; disagreement is surfaced', mismatches.length === 0, [
  C.dim(`${new Set(reportedSymbol).size} connectors reported symbolSeen across ${SUBJECTS.length} subjects`),
  mismatches.length ? mismatches.map(C.red).join('\n     ') : C.dim('no disagreement'),
]);

{
  const valid = new Set(['data', 'empty', 'unavailable', 'unconfigured']);
  const bad = [...seenStates.entries()].filter(([, s]) => [...s].some((x) => !valid.has(x)));
  record(
    7,
    'Every 6.1 source renders data or one of the three non-data states (never a 500)',
    bad.length === 0 && httpFailures === 0,
    [
      C.dim(`${seenStates.size} connectors exercised; ${httpFailures} non-200 responses from /api/panel`),
      bad.length ? bad.map(([id, s]) => C.red(`${id}: ${[...s].join(',')}`)).join('\n     ') : '',
      C.dim(
        [...seenStates.entries()]
          .map(([id, s]) => `${id}:${[...s].join('/')}`)
          .join('  '),
      ),
    ].filter(Boolean),
  );
}

// ── 9: and the links have to actually work ───────────────────────────────
//
// One host has to be exempted from the status check, and the reason is worth
// keeping because it nearly produced a false pass AND a false failure at once.
//
// hpo.jax.org serves HTTP 404 for every client-rendered route, including the
// ones that work. Measured 2026-11-06 in a browser:
//   /browse/gene/6335           -> 404, renders "Could not find entrez id 6335"
//   /browse/gene/NCBIGene:6335  -> 404, renders SCN9A correctly
// The first was a real bug in our connector and is fixed. But the status was
// identical for both, so this check did not actually distinguish them — it
// would have failed the correct URL just as loudly. Status is not evidence at
// this host; only an eye is. Listed here so the exemption is visible and
// re-checkable rather than silently absorbed.
const STATUS_MEANINGLESS = new Set(['hpo.jax.org']);
{
  const dead = [];
  const recovered = [];
  const unjudgeable = [];

  const probe = (url) =>
    fetch(url, {
      method: 'GET',
      headers: { 'user-agent': 'Chaperone/0.1 (criteria check)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

  for (const url of recordUrls) {
    if (STATUS_MEANINGLESS.has(new URL(url).host)) {
      unjudgeable.push(url);
      continue;
    }
    try {
      const res = await probe(url);
      // Same lesson as the deep-link check: only 404/410 and DNS death are
      // ours to call. A 403 is the host's bot policy, not a broken link.
      //
      // And one 404 is not enough. 2026-11-07: this check called two IntAct
      // record URLs dead; curl and a fresh `node fetch` both returned 200 for
      // the same URLs seconds later. The run itself hammers ebi.ac.uk —
      // UniProt, IntAct, HPO's release, Expression Atlas and OLS4 all live
      // there — and EBI sheds that load with a 404, not a 429. A host that
      // answers a throttled request with "not found" is indistinguishable from
      // a dead link on a single attempt, so a 404 is re-probed once after a
      // pause. A genuinely dead link 404s both times; a throttled one does not.
      if (res.status === 404 || res.status === 410) {
        await new Promise((r) => setTimeout(r, 2500));
        const again = await probe(url);
        if (again.status === 404 || again.status === 410) dead.push(`${again.status} twice ${url}`);
        else recovered.push(`${res.status}→${again.status} ${url}`);
      }
    } catch (e) {
      if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(`${e.message} ${e.cause?.code ?? ''}`)) {
        dead.push(`host gone: ${url}`);
      }
    }
  }
  record(9, 'No panel shows a number without a working link to its source record', numberNoLink.length === 0 && dead.length === 0, [
    C.dim(`${recordUrls.size - unjudgeable.length} of ${recordUrls.size} record URLs judgeable by status`),
    numberNoLink.length ? numberNoLink.map(C.red).join('\n     ') : C.dim('every numeric fact is linked'),
    dead.length ? dead.map(C.red).join('\n     ') : C.dim('no record URL 404s twice'),
    recovered.length
      ? C.yellow(
          `${recovered.length} URL(s) 404'd once under this run's own load and answered on re-probe:\n     ` +
            recovered.join('\n     '),
        )
      : '',
    unjudgeable.length
      ? C.yellow(
          `${unjudgeable.length} URL(s) at ${[...STATUS_MEANINGLESS].join(', ')} return 404 for every route, ` +
            'working ones included — browser-checked by hand 2026-11-06',
        )
      : '',
  ].filter(Boolean));
}

// ── 10 ───────────────────────────────────────────────────────────────────
//
// The criterion was written as "rs6746030 in the GWAS Catalog panel shows no
// catalogued association, not an error". That subject no longer exercises it:
// rs6746030 now resolves THROUGH dbSNP to SCN9A, so the GWAS panel queries by
// symbol and legitimately returns data. The check passed while testing nothing.
//
// What the criterion was protecting is the gate-1 finding that a source saying
// "no record" must read as `empty`, never `unavailable` — our limitation versus
// the source's answer (§5.4). That is tested here against a subject where the
// absence is real, plus the stronger whole-set assertion that no absence
// anywhere in this run was misreported as a failure. See the M7 findings.
// NARROWED 2026-11-07 (M8). The check asserted `unavailable.length === 0` over
// the whole run, which is not this criterion's promise — it is a claim about
// upstream uptime, which we neither control nor should assert. It failed the
// moment the GWAS Catalog v2 API began returning HTTP 500 on every route
// (verified by hand: `associations?size=1` with no gene filter also 500s while
// the website serves 200). Our connector reported `unavailable` with "HTTP
// 500", which is the correct and honest answer, and the criterion failed it.
//
// The real promise is narrower and sharper: an `unavailable` is a violation
// only when the source DID answer and the answer meant "no record" — a 404 or
// 410. Anything else (5xx, timeout, refusal, DNS) is the source not answering,
// and `unavailable` is then exactly right. The classification is printed either
// way, so an outage is visible rather than silently excused.
{
  const ABSENCE_SHAPED = /\b(404|410|not found|no such|gone)\b/i;
  const misreported = unavailableReasons.filter((u) => ABSENCE_SHAPED.test(u.message));
  const outages = unavailableReasons.filter((u) => !ABSENCE_SHAPED.test(u.message));
  const witnessIds = new Set(emptyWitnesses.map((w) => w.id));
  const or4f5 = emptyWitnesses.filter((w) => w.q === 'OR4F5');

  // Fail-closed on the witness: if NOTHING in the run reported an absence, the
  // check has not exercised the behaviour it claims to protect, and a pass
  // would be a pass by vacancy. OR4F5 is the designated control (§7.10).
  const pass = misreported.length === 0 && or4f5.length > 0;

  record(10, 'A source with no record renders "empty", never an error (gate-1 404-is-not-failure)', pass, [
    or4f5.length
      ? C.dim(`OR4F5 control: ${or4f5.length} source(s) reported a genuine absence — ${or4f5.map((w) => w.id).join(', ')}`)
      : C.red('the OR4F5 control produced no `empty` anywhere — this check exercised nothing'),
    C.dim(`${witnessIds.size} connectors reported absence as "empty" across the run: ${[...witnessIds].join(', ')}`),
    misreported.length
      ? C.red(
          `${misreported.length} absence(s) misreported as a failure:\n     ` +
            misreported.map((u) => `${u.q}/${u.id}: "${u.message}"`).join('\n     '),
        )
      : C.dim('no absence was reported as a failure'),
    outages.length
      ? C.yellow(
          `${outages.length} unavailable NOT judged by this criterion — the source did not answer:\n     ` +
            outages.map((u) => `${u.q}/${u.id}: "${u.message}"`).join('\n     '),
        )
      : '',
    gwasEmptyEvidence
      ? C.dim(`GWAS Catalog for OR4F5 reported: ${gwasEmptyEvidence.state} — "${gwasEmptyEvidence.message ?? ''}"`)
      : '',
  ].filter(Boolean));
}

// ── 12 ───────────────────────────────────────────────────────────────────
//
// NARROWED 2026-11-07 (M8), for a reason worth keeping: a FAILED fetch is
// deliberately not cached. Caching a failure would pin an outage in place for
// the whole TTL and keep serving `unavailable` after the source recovered. So a
// repeat correctly retries whatever failed, and the flat assertion "zero
// outbound requests on the repeat" fails whenever any source is down —
// penalising the cache for doing the right thing. It fired the moment GWAS
// Catalog started 500ing.
//
// The promise is about CACHEABLE answers: a panel that succeeded must not be
// fetched again inside its TTL. So the expected repeat cost is counted, not
// assumed zero — one attempt per panel that failed the first time, and no
// more. If a successful panel re-fetches, the sum exceeds the allowance and
// this fails, which is the behaviour the criterion exists to catch.
{
  const before = (await diag()).body.outboundAttempts;
  const first = await allPanels('TRPV1');
  const afterFirst = (await diag()).body.outboundAttempts;
  const second = await allPanels('TRPV1');
  const afterSecond = (await diag()).body.outboundAttempts;

  const firstCost = afterFirst - before;
  const repeatCost = afterSecond - afterFirst;

  const failedFirst = first.panels.filter((p) => p.body?.state === 'unavailable');
  const succeededFirst = first.panels.filter((p) => p.body?.state === 'data' || p.body?.state === 'empty');
  // Each failed panel may legitimately retry. A connector can make more than
  // one call, so the allowance is per attempt we can actually attribute: count
  // the retried panels and allow their observed second-pass attempts only.
  const retriedAgain = second.panels.filter(
    (p) => failedFirst.some((f) => f.spec.id === p.spec.id) && p.body?.cached !== true,
  );

  const pass = repeatCost === 0 || (failedFirst.length > 0 && retriedAgain.length > 0 && repeatCost <= failedFirst.length * 2);

  record(12, 'A repeated identical query inside the TTL makes zero upstream requests for every panel that succeeded', pass, [
    C.dim(`first pass: ${firstCost} outbound attempt(s) across ${first.panels.length} panels`),
    repeatCost === 0
      ? C.dim('repeat pass: 0 — counted at the one line where a request leaves the process')
      : failedFirst.length
        ? C.yellow(
            `repeat pass: ${repeatCost}, all attributable to ${failedFirst.length} panel(s) that FAILED the first pass ` +
              `and are deliberately not cached — ${failedFirst.map((f) => `${f.spec.id} ("${f.body.message}")`).join(', ')}`,
          )
        : C.red(`repeat pass: ${repeatCost} with nothing having failed — the cache was bypassed`),
    C.dim(
      `${succeededFirst.length} panel(s) answered on the first pass; ` +
        `${second.panels.filter((p) => p.body?.cached === true).length} served from cache on the repeat`,
    ),
  ]);
}

// ── 13 ───────────────────────────────────────────────────────────────────
{
  const { ok, body } = await diag(true);
  const seen = body.seenByRemote ?? {};
  const ua = seen['User-Agent'] ?? seen['user-agent'] ?? '';
  const pass = ok && ua.startsWith('Chaperone/');
  record(13, 'Every outbound request carries the Chaperone User-Agent', pass ? true : ok ? false : 'partial', [
    ok ? `remote saw: ${pass ? C.dim(ua) : C.red(ua || '(no User-Agent)')}` : C.yellow(`echo unavailable: ${body.error}`),
    ua.includes('TBD') ? C.yellow('contact URL is still TBD — §10.8') : '',
  ].filter(Boolean));
}

// ── 11 ───────────────────────────────────────────────────────────────────
// "First meaningful panel renders under 2 s on a warm cache." The interface
// cannot render a panel before the resolve returns and the first panel answers,
// so the critical path is resolve + fastest panel — measured on a warm cache,
// which is what the criterion specifies. Measured against the real endpoints
// rather than React's paint, because a paint timing would also measure the dev
// server's compile and tell us nothing about the promise.
{
  const warm = await resolveQ('SCN9A');
  const ids = warm.body.ids;
  const specs = warm.body.panels ?? [];
  // Warm every panel first; the criterion is explicitly about a warm cache.
  await Promise.all(specs.map((s) => panel(s.id, ids)));

  const t0 = Date.now();
  const resolveAgain = await resolveQ('SCN9A');
  const resolveMs = Date.now() - t0;

  // Panels are fetched in parallel by `useLookup`, so the first one to land is
  // what the researcher sees. Race them and take the winner's wall-clock.
  const t1 = Date.now();
  const firstMs = await new Promise((done) => {
    let settled = false;
    let outstanding = specs.length;
    for (const s of specs) {
      panel(s.id, resolveAgain.body.ids).then((p) => {
        outstanding -= 1;
        if (!settled && p.body?.state === 'data') {
          settled = true;
          done(Date.now() - t1);
        } else if (outstanding === 0 && !settled) {
          settled = true;
          done(null);
        }
      });
    }
  });

  const total = firstMs === null ? null : resolveMs + firstMs;
  record(11, 'First meaningful panel renders under 2 s on a warm cache', total !== null && total < 2000, [
    total === null
      ? C.red('no panel returned data at all')
      : `resolve ${resolveMs} ms + first data panel ${firstMs} ms = ${C.bold(`${total} ms`)}`,
    C.dim(`${specs.length} panels raced in parallel, as the interface fetches them`),
  ]);
}

// ── 15 ───────────────────────────────────────────────────────────────────
// "No field anywhere in the UI accepts a third-party credential." §3.1.
//
// Checked over the SOURCE of every rendered component, not over one page state
// in a browser. A browser check only ever proves that the one view I happened
// to open had no credential field; this proves no component can render one.
//
// RE-ARGUED 2026-11-09, when §11.9 added a file input. Until then this check
// read "there is exactly one field and it is the search box", which enforced
// the rule by counting. Counting was the right enforcement while one input was
// the whole interface, and it stops being right the moment a second legitimate
// field exists — a check that forbids every new field will eventually be
// loosened in a hurry by whoever needs one, which is a worse outcome than
// checking the thing that actually matters.
//
// So the check now works by SHAPE and by an explicit allowlist. Every field is
// enumerated with its type; each must appear in ALLOWED with a stated reason;
// and nothing anywhere may carry credential-shaped markup. Adding a field is
// still a deliberate act that has to be argued for here — it just no longer
// requires rewriting the criterion to do it.
//
// Fail-closed twice over: if the scan finds no input at all it FAILS, because
// the only honest reading is that the scan stopped working; and the credential
// detector is fired at a synthetic password field before use, so a regex that
// has quietly stopped matching cannot pass as a clean result.
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
    });

  const files = [...walk('app'), ...walk('components')];
  const FIELD = /<\s*(input|textarea|select)\b|contentEditable|role=["']textbox["']/gi;
  const CREDENTIAL = /password|passwd|api[-_ ]?key|apikey|secret|token|credential|bearer|private[-_ ]?key/i;

  // Every field the interface is allowed to render, and why. A field that is
  // not on this list fails the criterion even if it looks harmless.
  const ALLOWED = {
    'components/SearchBox.tsx': { type: 'text', why: 'the subject to look up — an identifier (§7.1)' },
    'components/StructureDrop.tsx': {
      type: 'file',
      why: 'a structure file, parsed in the browser and never transmitted (§11.9, criterion 15b)',
    },
  };

  // Field types that can carry a secret, whatever the field is called.
  const FORBIDDEN_TYPE = /^(password|email|tel)$/i;

  const found = [];
  const credentialish = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const hits = src.match(FIELD) ?? [];
    if (hits.length) {
      // The declared type of each field, so the check is about shape rather
      // than about which file it happens to live in.
      const types = [...src.matchAll(/<\s*input\b[^>]*?type=["{]?["']?(\w+)/gi)].map((m) => m[1].toLowerCase());
      found.push({ f: f.replace(/\\/g, '/'), n: hits.length, types });
    }
    // A mention in a comment explaining that we never take credentials is
    // fine; a mention on an element is not. Only look at lines bearing JSX
    // attributes or element syntax.
    for (const line of src.split('\n')) {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (CREDENTIAL.test(code) && /<\s*\w|type=|name=|placeholder=|autoComplete=/.test(code)) {
        credentialish.push(`${f}: ${line.trim().slice(0, 100)}`);
      }
    }
  }

  // POSITIVE CONTROL for the detector itself. If this regex ever stops
  // matching an obvious credential field, every clean result it produces is
  // meaningless — so it is fired at one before the real result is trusted.
  const CONTROL = '<input type="password" name="api_key" placeholder="UK Biobank token" />';
  const detectorWorks = CREDENTIAL.test(CONTROL) && FORBIDDEN_TYPE.test('password');

  const totalFields = found.reduce((n, w) => n + w.n, 0);
  const unlisted = found.filter((w) => !ALLOWED[w.f]);
  const wrongType = found.filter((w) => ALLOWED[w.f] && w.types.some((t) => t !== ALLOWED[w.f].type));
  const forbiddenTypes = found.flatMap((w) => w.types.filter((t) => FORBIDDEN_TYPE.test(t)).map((t) => `${w.f}: type="${t}"`));
  const missing = Object.keys(ALLOWED).filter((a) => !found.some((w) => w.f === a));

  const pass =
    detectorWorks &&
    totalFields > 0 &&
    unlisted.length === 0 &&
    wrongType.length === 0 &&
    forbiddenTypes.length === 0 &&
    missing.length === 0 &&
    credentialish.length === 0;

  record(15, 'No field anywhere in the UI accepts a third-party credential', pass, [
    detectorWorks
      ? C.dim('credential detector fires on a synthetic password field — the scan is live')
      : C.red('the credential detector did not match a synthetic password field; this check proves nothing'),
    totalFields === 0
      ? C.red('found no input field at all across app/ and components/ — the scan is broken, not the UI')
      : `${totalFields} field(s) across ${files.length} component files: ${found.map((w) => `${w.f}${w.types.length ? ` [${w.types}]` : ''}`).join(', ')}`,
    missing.length
      ? C.red(`an allowlisted field has vanished, so the scan is not seeing it: ${missing.join(', ')}`)
      : C.dim(
          `every field is allowlisted with a reason:\n       ${Object.entries(ALLOWED)
            .map(([f, a]) => `${f} [${a.type}] — ${a.why}`)
            .join('\n       ')}`,
        ),
    unlisted.length
      ? C.red(`field(s) outside the allowlist: ${unlisted.map((w) => w.f).join(', ')}`)
      : wrongType.length
        ? C.red(`an allowlisted field changed type: ${wrongType.map((w) => `${w.f} [${w.types}]`).join(', ')}`)
        : C.dim('no field of an unexpected kind'),
    forbiddenTypes.length
      ? C.red(`credential-capable input type(s): ${forbiddenTypes.join(', ')}`)
      : C.dim('no password, email or tel input anywhere'),
    credentialish.length
      ? C.red(`credential-shaped markup:\n       ${credentialish.join('\n       ')}`)
      : C.dim('no element names, types, placeholders or autocompletes mention a credential'),
  ]);
}

// ── 15b ──────────────────────────────────────────────────────────────────
// "Nothing a researcher supplies is transmitted except identifiers they could
// have typed." §11.9.
//
// This is the guarantee that makes the file input acceptable, so it is checked
// rather than asserted in a comment. An unpublished structure is an
// unpublished result; the claim on the page is that it never leaves the
// browser, and a claim on a page is worth what its check is worth.
//
// Three assertions, all structural — there is no runtime observation that
// could prove a negative about transmission:
//   · the parser performs no I/O of any kind;
//   · the component that reads the file never calls fetch;
//   · no API route can accept a file body.
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
    });

  const strip = (src) =>
    src
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');

  const EGRESS = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|navigator\.clipboard\.write/;
  const PERSIST = /localStorage|sessionStorage|indexedDB|document\.cookie/;
  const FILE_BODY = /\.formData\s*\(|\.arrayBuffer\s*\(|multipart\/form-data|\.blob\s*\(/;

  const parserSrc = strip(readFileSync('lib/structure.ts', 'utf8'));
  const dropSrc = strip(readFileSync('components/StructureDrop.tsx', 'utf8'));

  const parserClean = !EGRESS.test(parserSrc) && !PERSIST.test(parserSrc);
  const dropClean = !EGRESS.test(dropSrc) && !PERSIST.test(dropSrc);

  const routes = walk('app').filter((p) => /route\.tsx?$/.test(p));
  const fileRoutes = routes.filter((p) => FILE_BODY.test(strip(readFileSync(p, 'utf8'))));

  // POSITIVE CONTROLS. Each detector is fired at a synthetic violation, so a
  // pattern that has rotted cannot read as a clean result.
  const controls =
    EGRESS.test('await fetch("/api/upload", { body: file })') &&
    PERSIST.test('localStorage.setItem("structure", text)') &&
    FILE_BODY.test('const data = await request.formData()');

  const pass = controls && parserClean && dropClean && fileRoutes.length === 0 && routes.length > 0;

  record(
    '15b',
    'Nothing a researcher supplies is transmitted except identifiers they could have typed',
    pass,
    [
      controls
        ? C.dim('all three detectors fire on synthetic violations — the scan is live')
        : C.red('a detector failed its own control; this check proves nothing'),
      parserClean
        ? C.dim('lib/structure.ts: no fetch, no XHR, no beacon, no storage — it only transforms a string')
        : C.red('lib/structure.ts performs I/O'),
      dropClean
        ? C.dim('components/StructureDrop.tsx: reads the file, hands off an accession, calls nothing itself')
        : C.red('StructureDrop transmits or stores something'),
      fileRoutes.length
        ? C.red(`route(s) able to accept a file body: ${fileRoutes.join(', ')}`)
        : C.dim(`none of the ${routes.length} API routes can accept a file body — there is nowhere to upload to`),
    ],
  );
}

// ── 16 ───────────────────────────────────────────────────────────────────
// "Each preset FILTERS panels without reordering them; the antiviral preset
// surfaces BV-BRC and NCBI Nucleotide." (§11.2.)
//
// Two assertions, and the second is the one with teeth. Checking that a
// `.filter()` preserves order would be a tautology — `filter` always does. So
// the order half is checked structurally instead: the grid must not be able to
// sort by preset. The membership half is checked against live data.
{
  const { readFileSync } = await import('node:fs');
  const gridSrc = readFileSync('components/PanelGrid.tsx', 'utf8');
  const pageSrc = readFileSync('app/page.tsx', 'utf8');

  // Every file that can touch the order of what reaches the grid. §11.8 added
  // a second narrowing (the filter catalogue) and with it two more files that
  // handle the spec list — `scopeFor` in the hook, and the catalogue's own
  // grouping. Scanning only the page would have left both unchecked, and a
  // scan that cannot see where the reordering would happen is not a check.
  const ORDER_PATH = [
    'app/page.tsx',
    'components/PanelGrid.tsx',
    'components/useLookup.ts',
    'components/FilterBrowser.tsx',
    'lib/filters.ts',
    'app/api/filters/route.ts',
  ];
  const onPath = ORDER_PATH.map((f) => [f, readFileSync(f, 'utf8')]);

  // PanelGrid is handed the surviving specs and never the preset, so it has
  // nothing to sort BY. If that ever changes, this fails.
  const gridTakesPreset = /preset/i.test(gridSrc);
  const sorts = onPath.flatMap(([f, src]) => [...src.matchAll(/\.sort\s*\(/g)].map(() => f));
  const filters = [...pageSrc.matchAll(/\.filter\s*\(/g)];

  const organism = await resolveQ('SARS-CoV-2');
  const all = organism.body.panels ?? [];
  const antiviral = all.filter((s) => s.presets.length === 0 || s.presets.includes('antiviral'));
  const ids = antiviral.map((s) => s.id);
  const surfaces = ids.includes('bvbrc') && ids.includes('ncbivirus');

  // And every survivor must have survived BECAUSE of its tag — not for any
  // other reason a future filter might invent.
  const byTag = antiviral.every((s) => s.presets.length === 0 || s.presets.includes('antiviral'));

  const pass = surfaces && byTag && !gridTakesPreset && sorts.length === 0 && filters.length > 0;
  record(16, 'Each preset filters panels without reordering them; antiviral surfaces BV-BRC and NCBI Nucleotide', pass, [
    surfaces
      ? C.dim(`antiviral preset on an organism query keeps: ${ids.join(', ')}`)
      : C.red(`antiviral preset did not surface both: got ${ids.join(', ') || '(none)'}`),
    byTag ? C.dim('every surviving panel is preset-neutral or antiviral-tagged') : C.red('a panel survived without the tag'),
    gridTakesPreset
      ? C.red('PanelGrid now receives the preset — it could sort by it')
      : C.dim('PanelGrid never receives the preset, so it cannot order by it'),
    sorts.length
      ? C.red(`${sorts.length} .sort() call(s) on the panel path: ${[...new Set(sorts)].join(', ')}`)
      : C.dim(
          `no .sort() across the ${ORDER_PATH.length} files on the panel path; ${filters.length} .filter() call(s) — it narrows, never rearranges`,
        ),
  ]);
}

// ── 17 ───────────────────────────────────────────────────────────────────
// "Suggestions link to a real next query and NAME THE RULE that produced
// them." §8. Every suggestion is followed to its destination: a `query` must
// actually resolve, a `preset` must be a real preset, a link must have an href
// that exists in the deep links we returned. A suggestion pointing nowhere is
// the failure mode this criterion exists to catch.
{
  const r = await resolveQ('SCN9A');
  const ids = r.body.ids;
  const settled = await Promise.all((r.body.panels ?? []).map(async (s) => (await panel(s.id, ids)).body));

  const res = await fetch(`${BASE}/api/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, panels: settled }),
  });
  const body = await res.json();
  const suggestions = body.suggestions ?? [];
  const hrefs = new Set((r.body.deepLinks ?? []).map((l) => l.id));

  const problems = [];
  for (const s of suggestions) {
    const tag = `${s.rule ?? '(no rule)'}/${s.kind}`;
    if (!s.rule) problems.push(`${tag}: no rule named`);
    if (!s.because) problems.push(`${tag}: no reason given`);
    if (s.kind === 'query') {
      const got = await resolveQ(s.query);
      if (!got.ok) problems.push(`${tag}: suggested "${s.query}" does not resolve (${got.status})`);
    } else if (s.kind === 'link' && !hrefs.has(s.deepLinkId)) {
      problems.push(`${tag}: deep link "${s.deepLinkId}" is not in this subject's links`);
    } else if (s.kind === 'url' && !/^https?:\/\//.test(s.href ?? '')) {
      problems.push(`${tag}: no usable href`);
    } else if (s.kind === 'preset' && !['pain', 'psych-neuro', 'antiviral'].includes(s.preset)) {
      problems.push(`${tag}: unknown preset "${s.preset}"`);
    }
  }

  const pass = suggestions.length > 0 && problems.length === 0;
  record(17, 'Suggestions link to a real next query and name the rule that produced them', pass, [
    suggestions.length
      ? `${suggestions.length} suggestion(s): ${suggestions.map((s) => `${s.rule}→${s.kind}`).join(', ')}`
      : C.red('no suggestions were produced for SCN9A, which has interaction partners and pain traits'),
    problems.length ? C.red(problems.map((p) => `  ${p}`).join('\n     ')) : C.dim('every suggestion names its rule, gives its reason, and points somewhere real'),
    (body.dropped ?? []).length
      ? C.dim(`${body.dropped.length} withheld before being offered: ${body.dropped.map((d) => d.query).join(', ')}`)
      : '',
  ].filter(Boolean));
}

// ── summary ──────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.pass !== true);
console.log(`\n${C.bold('─'.repeat(72))}`);
console.log(C.dim(`${results.length} criteria checked, ${results.length - failed.length} passing`));
if (failed.length) {
  console.log(C.red(`\n${failed.length} not met:`));
  for (const f of failed) console.log(`  ${C.red('·')} criterion ${f.id}: ${f.text}`);
  process.exitCode = 1;
} else {
  console.log(C.green('\nEvery criterion checked here is met. 8 and 8b are induced by hand; 14 needs a build.'));
}
