#!/usr/bin/env node
// Chaperone's verification instrument. PROJECT-PLAN.md §14.1.
//
// Backend-first removes "look at the page" as the way to tell whether
// something works, so this replaces it with something stricter: for each test
// subject it calls /api/resolve, then every panel the resolver offers, and
// reports state, latency, cache hit and the symbol each source believed it
// answered about.
//
// It fails loudly on a cross-source symbol mismatch — the SCN8A/SCN9A class of
// error that passed unnoticed during gate 1.
//
// Usage:  npm run probe            (needs `npm run dev` running)
//         npm run probe -- SCN9A rs1333049

const BASE = process.env.CHAPERONE_URL || 'http://localhost:3000';

const DEFAULT_SUBJECTS = [
  // symbol — the three domains.
  // `rules` names suggestion rules that MUST fire. The rules layer fails
  // closed by design (lib/signals.ts), so without this a label change in a
  // connector would leave it silently suggesting nothing at all.
  { q: 'SCN9A', expect: { symbol: 'SCN9A', kind: 'symbol', rules: ['interaction-partner', 'trait-preset'] } },
  { q: 'COMT', expect: { symbol: 'COMT', kind: 'symbol', rules: ['interaction-partner'] } },
  { q: 'TRPV1', expect: { symbol: 'TRPV1', kind: 'symbol' } },
  { q: 'IFNAR2', expect: { symbol: 'IFNAR2', kind: 'symbol' } },
  // the same gene by three different identifiers must agree (criterion 3)
  { q: 'Q15858', expect: { symbol: 'SCN9A', kind: 'uniprot' } },
  { q: 'ENSG00000169432', expect: { symbol: 'SCN9A', kind: 'ensembl' } },
  // variant with gene context via GWAS Catalog fallback
  { q: 'rs1333049', expect: { kind: 'rsid', rules: ['variant-to-gene'] } },
  // variant with no catalogued association — must not read as an error
  { q: 'rs6746030', expect: { kind: 'rsid' } },
  // free text — a trait, which must NOT resolve as an organism
  { q: 'neuropathic pain', expect: { kind: 'text' } },
  // free text — an organism, which must NOT resolve as a trait (M5).
  // SARS-CoV-2 is the extreme case for sequence counts; Zika is the control
  // that shows those counts track surveillance effort, not biology.
  { q: 'SARS-CoV-2', expect: { kind: 'text', rules: ['organism-resolved'] } },
  { q: 'Zika virus', expect: { kind: 'text', rules: ['organism-resolved'] } },
  // one entry, several proteins
  { q: '6J8G', expect: { kind: 'pdb' } },
  // protein complex
  { q: 'CHEMBL4523670', expect: { kind: 'chembl' } },
  // molecule, not a target
  { q: 'CHEMBL25', expect: { kind: 'chembl' } },
  // must fail helpfully, not crash (criterion 5)
  { q: 'ZZQQXX9', expect: { fails: true } },
];

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const STATE_MARK = { data: C.green('data'), empty: C.dim('no entry'), unavailable: C.red('UNAVAIL'), unconfigured: C.yellow('no key') };

const failures = [];

async function probe(subject) {
  const { q, expect = {} } = subject;
  console.log(`\n${C.bold(q)}`);

  let r;
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/resolve?q=${encodeURIComponent(q)}`);
    r = await res.json();
    if (!res.ok) {
      if (expect.fails) {
        const helpful = typeof r.error === 'string' && r.error.length > 40;
        console.log(`  ${helpful ? C.green('PASS') : C.red('FAIL')} expected failure: ${r.error}`);
        if (!helpful) failures.push(`${q}: failure message too terse to help`);
      } else {
        console.log(`  ${C.red('FAIL')} resolve ${res.status}: ${r.error}`);
        failures.push(`${q}: resolve failed — ${r.error}`);
      }
      return;
    }
  } catch (e) {
    console.log(`  ${C.red('FAIL')} resolver unreachable: ${e.message}`);
    failures.push(`${q}: resolver unreachable`);
    return;
  }

  if (expect.fails) {
    console.log(`  ${C.red('FAIL')} expected this to be unresolvable, but it resolved`);
    failures.push(`${q}: expected unresolvable, got a result`);
    return;
  }

  const ids = r.ids;
  console.log(`  ${C.dim('resolved')} ${Date.now() - t0}ms · kind=${ids.kind} · ${ids.symbol ?? ids.traitName ?? ids.chemblId ?? ids.coordinate ?? '—'}`);

  const shown = [
    ids.uniprot && `UniProt ${ids.uniprot}`,
    ids.hgnc,
    ids.ncbiGene && `GeneID ${ids.ncbiGene}`,
    ids.gencodeId,
    ids.efoId,
  ].filter(Boolean);
  if (shown.length) console.log(`  ${C.dim('ids')}      ${shown.join(' · ')}`);

  if (expect.kind && ids.kind !== expect.kind) {
    console.log(`  ${C.red('FAIL')} kind: expected ${expect.kind}, got ${ids.kind}`);
    failures.push(`${q}: kind ${ids.kind} != ${expect.kind}`);
  }
  if (expect.symbol && ids.symbol !== expect.symbol) {
    console.log(`  ${C.red('FAIL')} symbol: expected ${expect.symbol}, got ${ids.symbol}`);
    failures.push(`${q}: symbol ${ids.symbol} != ${expect.symbol}`);
  }

  for (const n of r.notes ?? []) console.log(`  ${C.yellow('note')}     ${n}`);

  if (!r.panels?.length) {
    console.log(`  ${C.dim('panels')}   none offered`);
    return;
  }

  const loaded = [];
  for (const spec of r.panels) {
    try {
      const res = await fetch(`${BASE}/api/panel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: spec.id, ids }),
      });
      const p = await res.json();
      loaded.push(p);
      const cache = p.cached ? C.dim(' cached') : '';
      console.log(`  ${STATE_MARK[p.state] ?? p.state}  ${spec.id.padEnd(16)} ${String(p.ms).padStart(5)}ms${cache} ${p.state !== 'data' ? C.dim(p.message ?? '') : ''}`);

      // The check that matters most (§7.6).
      if (p.symbolSeen && ids.symbol && p.symbolSeen.toUpperCase() !== ids.symbol.toUpperCase()) {
        console.log(`        ${C.red('SYMBOL MISMATCH')} ${spec.id} answered about ${p.symbolSeen}, resolver said ${ids.symbol}`);
        failures.push(`${q}: ${spec.id} answered about ${p.symbolSeen}, expected ${ids.symbol}`);
      }
      if (p.state === 'unavailable') failures.push(`${q}: ${spec.id} unavailable — ${p.message}`);
    } catch (e) {
      console.log(`  ${C.red('FAIL')}  ${spec.id} request threw: ${e.message}`);
      failures.push(`${q}: ${spec.id} threw`);
    }
  }

  await checkSuggestions(subject, r, ids, loaded);
}

/**
 * The rules layer (§8), checked over HTTP because there is still no interface.
 *
 * Four things are asserted, and the third is the one that matters:
 *
 *  1. Every rule in `expect.rules` fired. The rules fail closed, so a
 *     connector relabelling a fact would otherwise just stop producing
 *     suggestions with nothing to show it.
 *  2. Every suggested query actually resolves — criterion 17, "link to a real
 *     next query". A suggestion to open a gene that 404s is worse than none.
 *  3. EVERY SUGGESTED SYMBOL CAME FROM A SOURCE. A suggested query must appear
 *     somewhere in the panel payloads this subject returned. suggest.ts forbids
 *     deriving a symbol — stripping SCN9A down to offer SCN8A is the §6.5
 *     failure wearing a different hat — and this is how that promise is kept
 *     honest from outside the code: an invented symbol appears in no panel.
 *  4. Nothing suggests the subject the researcher is already looking at.
 */
async function checkSuggestions(subject, r, ids, panels) {
  const { q, expect = {} } = subject;

  let s;
  try {
    const res = await fetch(`${BASE}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, panels }),
    });
    s = await res.json();
    if (!res.ok) {
      console.log(`  ${C.red('FAIL')}     suggest ${res.status}: ${s.error}`);
      failures.push(`${q}: /api/suggest ${res.status} — ${s.error}`);
      return;
    }
  } catch (e) {
    console.log(`  ${C.red('FAIL')}     suggest threw: ${e.message}`);
    failures.push(`${q}: /api/suggest threw`);
    return;
  }

  const suggestions = s.suggestions ?? [];
  if (!suggestions.length) {
    console.log(`  ${C.dim('rules')}    none fired`);
  }

  // Everything a SOURCE said, for the provenance check.
  //
  // Panels are not the whole surface. The resolver also returns source-named
  // symbols: Open Targets' genes for a resolved trait, and the genes dbSNP (or
  // the GWAS Catalog) maps a variant to. When `traitGenes` was added in M7
  // this check fired on ACE2 for SARS-CoV-2 — a correct suggestion, since ACE2
  // is Open Targets' top COVID-19 association, flagged only because the
  // haystack was panels alone.
  //
  // The id fields are listed explicitly rather than stringifying `ids`
  // wholesale: `ids` also carries `query`, which is the user's own text, and
  // folding that in would let a suggestion launder the input back as if a
  // source had named it. The point of this check is provenance, so only
  // source-returned fields count.
  const haystack = JSON.stringify([
    panels,
    ids.traitGenes ?? [],
    ids.variant?.genes ?? [],
    ids.alsoResolvesTo ?? [],
    ids.symbol ?? '',
  ]).toUpperCase();
  const linkIds = new Set((r.deepLinks ?? []).map((l) => l.id));
  const fired = new Set();

  for (const x of suggestions) {
    for (const rule of x.rule.split(' + ')) fired.add(rule);
    const target =
      x.kind === 'query' ? x.query : x.kind === 'preset' ? x.preset : x.kind === 'link' ? x.deepLinkId : x.href;
    console.log(`  ${C.yellow('rule')}     ${x.rule.padEnd(34)} ${C.dim(`${x.kind}:`)}${target}`);

    if (x.kind === 'query') {
      if (ids.symbol && x.query.toUpperCase() === ids.symbol.toUpperCase()) {
        failures.push(`${q}: suggests the subject itself (${x.query})`);
      }
      // (3) — provenance.
      if (!haystack.includes(x.query.toUpperCase())) {
        console.log(`        ${C.red('UNSOURCED')} ${x.query} appears in no panel this subject returned`);
        failures.push(`${q}: suggested ${x.query}, which no source named — a derived symbol (§6.5)`);
      }
      // (2) — it has to actually work.
      try {
        const res = await fetch(`${BASE}/api/resolve?q=${encodeURIComponent(x.query)}`);
        if (!res.ok) {
          console.log(`        ${C.red('DEAD QUERY')} ${x.query} -> resolve ${res.status}`);
          failures.push(`${q}: suggested query ${x.query} does not resolve (${res.status})`);
        }
      } catch {
        failures.push(`${q}: suggested query ${x.query} could not be checked`);
      }
    }

    if (x.kind === 'link' && !linkIds.has(x.deepLinkId)) {
      failures.push(`${q}: suggests deep link '${x.deepLinkId}', which is not offered for this subject`);
    }
    if (x.kind === 'url' && !x.href.startsWith('https://')) {
      failures.push(`${q}: suggested a non-https URL — ${x.href}`);
    }
    if (!x.because || x.because.length < 25) {
      failures.push(`${q}: rule '${x.rule}' gave no usable reason (§8 requires one)`);
    }
  }

  // A suggestion the route withheld because it cannot be opened here. The rule
  // still fired, so it counts as fired — printed, not hidden, because it marks
  // a real gap (a gene a source named that the resolver cannot follow).
  for (const d of s.dropped ?? []) {
    for (const rule of d.rule.split(' + ')) fired.add(rule);
    console.log(`  ${C.dim('withheld')} ${d.rule.padEnd(34)} ${C.dim(`${d.query} — not resolvable here`)}`);
  }

  for (const rule of expect.rules ?? []) {
    if (!fired.has(rule)) {
      console.log(`  ${C.red('FAIL')}     rule '${rule}' did not fire`);
      failures.push(`${q}: expected rule '${rule}' to fire — the signal it reads may have moved`);
    }
  }
}

const args = process.argv.slice(2);
const subjects = args.length ? args.map((q) => ({ q, expect: {} })) : DEFAULT_SUBJECTS;

console.log(C.bold(`Chaperone probe → ${BASE}`));
console.log(C.dim(`${subjects.length} subjects`));

for (const s of subjects) await probe(s);

console.log(`\n${C.bold('─'.repeat(60))}`);
if (failures.length) {
  console.log(C.red(`${failures.length} failure(s):`));
  for (const f of failures) console.log(`  ${C.red('·')} ${f}`);
  process.exitCode = 1;
} else {
  console.log(C.green('All checks passed.'));
}
