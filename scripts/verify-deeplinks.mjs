#!/usr/bin/env node
// Gate-5 check for the §6.4 deep links. PROJECT-PLAN.md §14.3 / M6.
//
// A deep link is a claim about someone else's URL scheme, and it is the one
// kind of claim nothing else here tests: a connector that breaks reports
// `unavailable`, but a dead deep link just hands the researcher a 404 and lets
// them conclude the resource has nothing for their gene.
//
// ─────────────────────────────────────────────────────────────────────────
// WHAT THIS SCRIPT CAN AND CANNOT DECIDE.
//
// The first version of this check failed nine links. Four were real. The other
// five were the check misreading its own blind spots:
//
//   - SCHEMA and BipEx serve a 1kB app shell to a script — THE SAME SHELL for
//     a nonsense gene id, so a 200 proved nothing either way. Both are correct;
//     only a browser sees it.
//   - DECIPHER answers a script with HTTP 500 and a browser with the full
//     record. Expression Atlas answers a script with nothing at all, for at
//     least 90 seconds, and a browser in about one.
//   - OMIM returns a Cloudflare bot challenge to anything automated.
//
// So a non-200 from these sites is evidence about their bot policy, not about
// the link. Treating it as failure produces a check that cries wolf, and a
// check that cries wolf gets ignored — which is how a genuinely dead link
// would survive. Each link therefore declares in `verifiedBy` how it was
// established, and this script only fails what it can actually judge:
//
//   HARD FAILURE   DNS failure, 404 or 410 — the path or host is gone.
//                  This is what caught humanpaingeneticsdb.mcgill.ca (NXDOMAIN)
//                  and it is the failure mode that matters.
//   ALSO FAILS     a `verifiedBy: 'fetch'` link that stops naming its subject.
//   REPORTED ONLY  403 / 5xx / timeout (the site refuses automation) and any
//                  redirect, printed with the destination so a moved URL gets
//                  noticed. UK Biobank and dbGaP were both found this way.
//
// Links marked `browser` or `blocked` are NOT machine-verifiable. The count is
// printed every run so it cannot quietly become most of the table.
// ─────────────────────────────────────────────────────────────────────────
//
// Identifiers come from the live resolver, never from a literal here (§6.5).
//
// Usage:  npm run verify:deeplinks        (needs `npm run dev` running)

const BASE = process.env.CHAPERONE_URL || 'http://localhost:3000';
// §10.8. The old fallback here was a github.com/TBD/... placeholder, which was
// worse than nothing: it looks like a real contact address and resolves
// nowhere, so an administrator who followed it would find a 404 instead of the
// tool. The deployed site is the contact address.
const CONTACT = process.env.CHAPERONE_CONTACT_URL || 'https://chaperone-cyan.vercel.app';
const UA = `Chaperone/0.1 (${CONTACT})`;
const TIMEOUT_MS = 20000;

// Typed as a researcher would type them. These are QUERIES, not asserted
// identifiers — every id they produce comes back from /api/resolve.
const SUBJECTS = ['SCN9A', 'SARS-CoV-2'];

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const failures = [];
const notes = [];
const unverifiable = [];
const checked = new Set();

/** The identifier values this href was built from, to look for in the body. */
function identifiersIn(href, ids) {
  return [ids.symbol, ids.ensemblGene, ids.taxid, ids.uniprot]
    .filter(Boolean)
    .filter((v) => href.includes(encodeURIComponent(v)) || href.includes(v));
}

/** Short, readable host for printing a redirect. */
function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

async function check(link, ids) {
  const key = `${link.id} ${link.href}`;
  if (checked.has(key)) return;
  checked.add(key);

  if (link.verifiedBy === 'browser' || link.verifiedBy === 'blocked') unverifiable.push(link.id);

  const wanted = identifiersIn(link.href, ids);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  let res;
  let body = '';
  try {
    res = await fetch(link.href, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: ctl.signal,
    });
    body = await res.text();
  } catch (e) {
    clearTimeout(timer);
    const dns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(`${e.message} ${e.cause?.code ?? ''}`);
    const timedOut = e.name === 'AbortError';
    if (dns) {
      console.log(`  ${C.red('GONE')}       ${link.id.padEnd(18)} ${C.dim(link.href)}`);
      failures.push(`${link.id}: host does not resolve — ${hostOf(link.href)}`);
    } else {
      console.log(`  ${C.dim('refused')}    ${link.id.padEnd(18)} ${C.dim(timedOut ? `no response in ${TIMEOUT_MS}ms` : e.message)}`);
      notes.push(`${link.id}: ${timedOut ? 'no response to a scripted fetch' : e.message} (expected: verifiedBy='${link.verifiedBy}')`);
    }
    return;
  }
  clearTimeout(timer);

  const ms = Date.now() - t0;
  const kb = Math.round(body.length / 1024);
  const found = wanted.filter((v) => body.includes(v));
  const moved = res.url !== link.href;

  // ── the one hard failure a script can be sure about ──────────────────
  if (res.status === 404 || res.status === 410) {
    console.log(`  ${C.red('GONE')}       ${link.id.padEnd(18)} ${res.status} ${C.dim(link.href)}`);
    failures.push(`${link.id}: HTTP ${res.status} — the path is gone`);
    return;
  }

  let mark;
  if (!res.ok) {
    // 403 / 5xx: the site is refusing us, which tells us nothing about the link.
    mark = C.dim(`${res.status}`);
    notes.push(`${link.id}: HTTP ${res.status} to a scripted fetch (expected: verifiedBy='${link.verifiedBy}')`);
  } else if (link.verifiedBy === 'fetch') {
    if (wanted.length && !found.length) {
      mark = C.red('NO-ID');
      failures.push(
        `${link.id}: verifiedBy='fetch' but ${wanted.join('/')} is absent from ${kb}kB of HTML — ` +
          `this link used to name its subject and no longer does`,
      );
    } else {
      mark = C.green('OK');
    }
  } else if (found.length) {
    mark = C.green('OK');
  } else {
    mark = C.dim(link.verifiedBy);
  }

  console.log(
    `  ${mark.padEnd(18)} ${link.id.padEnd(18)} ${String(ms).padStart(5)}ms ${String(kb).padStart(4)}kB ` +
      `${C.dim(`${link.lands}/${link.verifiedBy}`)}${moved ? C.yellow(` → ${hostOf(res.url)}`) : ''}`,
  );

  if (moved) {
    notes.push(`${link.id}: redirected to ${res.url} — point the link there if it is permanent`);
  }
}

console.log(C.bold(`Chaperone deep-link check → ${BASE}`));

for (const q of SUBJECTS) {
  console.log(`\n${C.bold(q)}`);
  let r;
  try {
    const res = await fetch(`${BASE}/api/resolve?q=${encodeURIComponent(q)}`);
    r = await res.json();
    if (!res.ok) {
      console.log(`  ${C.red('FAIL')} resolve ${res.status}: ${r.error}`);
      failures.push(`${q}: could not resolve, so its links were never checked`);
      continue;
    }
  } catch (e) {
    console.log(`  ${C.red('FAIL')} resolver unreachable: ${e.message} — is \`npm run dev\` running?`);
    process.exitCode = 1;
    break;
  }

  const links = r.deepLinks ?? [];
  console.log(C.dim(`  ${links.length} link(s) buildable from these identifiers`));
  for (const link of links) await check(link, r.ids);
}

console.log(`\n${C.bold('─'.repeat(72))}`);
if (notes.length) {
  console.log(C.yellow(`${notes.length} to read, none of them a failure:`));
  for (const n of notes) console.log(`  ${C.yellow('·')} ${n}`);
  console.log('');
}
console.log(
  C.dim(
    `${new Set(unverifiable).size} link(s) cannot be machine-checked (verifiedBy browser/blocked): ` +
      `${[...new Set(unverifiable)].join(', ')}.\n` +
      `Re-check those by hand in a browser, with a nonsense-identifier control, when this table changes.`,
  ),
);

if (failures.length) {
  console.log(C.red(`\n${failures.length} dead link(s):`));
  for (const f of failures) console.log(`  ${C.red('·')} ${f}`);
  process.exitCode = 1;
} else {
  console.log(C.green('\nNo dead links: every host resolved and no path returned 404.'));
}
