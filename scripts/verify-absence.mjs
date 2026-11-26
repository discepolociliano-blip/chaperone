// Criterion 10b — an absence is confirmed before it is reported.
// PROJECT-PLAN.md §11.7, §5.4.
//
// WHY THIS IS A SEPARATE SCRIPT. Every other check in this project runs against
// live sources, which is right: they verify that the real world behaves as the
// code assumes. This one cannot. It has to observe what Chaperone does when a
// source returns 404 **and then returns 200 for the same URL seconds later** —
// which is precisely the load-shedding behaviour we are defending against, and
// which cannot be requested on demand from anybody's API without abusing it.
//
// So the source here is a local server that does exactly that, on command. No
// external traffic, deterministic, and every branch reachable. It is the only
// way to prove that a refusal dressed as an absence is caught — the §11.7 risk
// that stood open from M8.
//
// THE CASE THAT MATTERS is case 2. Before the fix it produced `empty`: a panel
// reading "this source has no record for this subject" about a record that
// exists. That is the §5.4 failure, arrived at through the one door §5.4 does
// not watch.

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── compile lib/http.ts so it can be exercised directly ───────────────────
// Through the dev server this would need a route that fetches an arbitrary
// URL, which is an SSRF-shaped endpoint; it would be dev-only, and it would
// still be the wrong thing to add to a project this careful about exactly that.
const OUT = join('node_modules', '.cache', 'chaperone-verify');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// CommonJS output, because tsc does not rewrite `./cache` to `./cache.js` and
// Node's ESM loader demands the extension. CJS resolves it either way, and the
// module under test is identical.
const tsc = spawnSync(
  'npx',
  ['tsc', 'lib/http.ts', '--target', 'es2022', '--module', 'commonjs', '--strict', '--outDir', OUT],
  { encoding: 'utf8' },
);
if (tsc.status !== 0) {
  console.error(C.red('could not compile lib/http.ts'));
  console.error(tsc.stdout || tsc.stderr);
  process.exit(1);
}
writeFileSync(join(OUT, 'package.json'), '{"type":"commonjs"}');

const require = createRequire(import.meta.url);
const { fetchJson, outboundAttemptCount, NoEntry, Unavailable } = require(
  join(process.cwd(), OUT, 'http.js'),
);

// ── a source that behaves however a case needs it to ──────────────────────
// Each route is a script of responses, consumed one per request. Running off
// the end repeats the last entry, so "always 404" is just [404].
const scripts = new Map();
let hits = new Map();

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const script = scripts.get(path);
  const n = (hits.get(path) ?? 0) + 1;
  hits.set(path, n);

  if (!script) {
    res.writeHead(500).end('no script');
    return;
  }
  const step = script[Math.min(n - 1, script.length - 1)];

  if (step.status === 204) {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(step.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(step.body ?? { error: `status ${step.status}` }));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ── the harness ───────────────────────────────────────────────────────────
let failures = 0;
const results = [];

/** Runs one case and reports the state it produced and how many requests it took. */
async function run(name, path, script, { emptyOn = [404], calls = 1 } = {}) {
  scripts.set(path, script);
  hits.set(path, 0);
  const before = outboundAttemptCount();
  const outcomes = [];

  for (let i = 0; i < calls; i++) {
    try {
      const r = await fetchJson(`${BASE}${path}`, {
        timeoutMs: 4000,
        ttlMs: 60_000,
        emptyOn,
        cacheKey: `absence-test ${path}`,
      });
      outcomes.push({ state: 'data', detail: JSON.stringify(r.json), cached: r.cached });
    } catch (e) {
      const state = e instanceof NoEntry ? 'empty' : e instanceof Unavailable ? 'unavailable' : 'threw';
      outcomes.push({ state, detail: e.message });
    }
  }

  return { name, requests: outboundAttemptCount() - before, outcomes };
}

function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  results.push(
    `  ${ok ? C.green('ok  ') : C.red('FAIL')} ${label}\n       ${ok ? C.dim(`${JSON.stringify(got)}`) : C.red(`got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)}`,
  );
}

console.log(C.bold('\nCriterion 10b — an absence is confirmed before it is reported\n'));
console.log(C.dim(`  a scripted source on ${BASE}; no external traffic\n`));

const started = Date.now();

// 1. A real absence. Asked twice, told the same thing twice.
{
  const r = await run('persistent 404', '/gone', [{ status: 404 }]);
  check('a persistent 404 is empty', r.outcomes[0].state, 'empty');
  check('and it asked twice before saying so', r.requests, 2);
  check('and the message says it asked twice', r.outcomes[0].detail.includes('asked twice'), true);
}

// 2. THE CASE THIS EXISTS FOR. A refusal dressed as an absence.
//    This is what ebi.ac.uk did to two IntAct URLs on 2026-11-09.
{
  const r = await run('404 then 200 — a shed request', '/shed', [
    { status: 404 },
    { status: 200, body: { real: 'record', value: 42 } },
  ]);
  check('a 404 that clears is NOT reported as absence', r.outcomes[0].state, 'data');
  // Read through the state rather than parsing blind: when this check fails it
  // fails BECAUSE the outcome is an error message, and a harness that throws on
  // the failure it exists to detect is no better than no harness.
  check(
    'the data the source actually had comes through',
    r.outcomes[0].state === 'data' ? JSON.parse(r.outcomes[0].detail).value : `(${r.outcomes[0].state}) ${r.outcomes[0].detail}`,
    42,
  );
  check('it took two requests', r.requests, 2);
}

// 3. Could not confirm. We do not know, so we do not claim.
{
  const r = await run('404 then 500', '/flaky', [{ status: 404 }, { status: 500 }]);
  check('an unconfirmable absence is unavailable, not empty', r.outcomes[0].state, 'unavailable');
  check('and says absence was not established', r.outcomes[0].detail.includes('absence not established'), true);
}

// 4. 204 is an answer, not an ambiguity. Re-asking would be waste.
{
  const r = await run('204 no content', '/nothing', [{ status: 204 }], { emptyOn: [204, 404] });
  check('204 is empty', r.outcomes[0].state, 'empty');
  check('and is NOT re-probed — one request only', r.requests, 1);
}

// 5. A 5xx is a decision by the server; §5.3 says do not hammer it.
{
  const r = await run('persistent 500', '/down', [{ status: 500 }]);
  check('a 500 is unavailable', r.outcomes[0].state, 'unavailable');
  check('and is not re-probed', r.requests, 1);
}

// 6. The confirmed absence is cached, so a subject pays the cost once per TTL.
{
  const r = await run('repeat inside the TTL', '/gone-again', [{ status: 404 }], { calls: 2 });
  check('both calls are empty', r.outcomes.map((o) => o.state), ['empty', 'empty']);
  check('two requests in total, not four — the absence was cached', r.requests, 2);
}

// 7. A recovered response is cached as data, not re-fetched.
{
  const r = await run('recovery is cached', '/shed-again', [{ status: 404 }, { status: 200, body: { ok: 1 } }], {
    calls: 2,
  });
  check('both calls give data', r.outcomes.map((o) => o.state), ['data', 'data']);
  check('the second was served from cache', r.outcomes[1].cached, true);
  check('two requests in total', r.requests, 2);
}

console.log(results.join('\n'));
server.close();

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(C.dim(`\n  ${secs}s — most of it the deliberate waits before each confirming request`));
console.log('─'.repeat(72));
if (failures === 0) {
  console.log(C.green('\nAn absence is never reported without a second witness.\n'));
} else {
  console.log(C.red(`\n${failures} check(s) failed.\n`));
}
process.exit(failures ? 1 : 0);
