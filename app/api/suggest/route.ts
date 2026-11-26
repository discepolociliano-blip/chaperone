// POST /api/suggest  { ids, panels }  ->  { suggestions, dropped }
// PROJECT-PLAN.md §8, criterion 17.
//
// `suggest()` itself is pure — rules over identifiers and already-loaded
// panels, no I/O. This route adds the one thing purity cannot give it:
// proof that a suggested query actually opens.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE ROUTE RE-RESOLVES WHAT IT IS ABOUT TO SUGGEST.
//
// Measured 2026-11-06. dbSNP maps rs1333049 to CDKN2B-AS1 and rs6746030 to
// SCN1A-AS1. Both are real genes, correctly reported, and NEITHER resolves
// here: the resolver's spine is UniProt (§6.5), which carries reviewed
// protein-coding entries, and an antisense RNA gene has no protein record.
//
// So the honest rule produced a suggestion that 404s — "link to a real next
// query" (criterion 17) broken by a gene that genuinely exists. Suggesting it
// anyway would teach a researcher that Chaperone's suggestions are unreliable,
// which costs more than the suggestion is worth.
//
// Each query suggestion is therefore resolved before being offered, and the
// §5.4 distinction decides what that means:
//
//   NoEntry      we cannot open this subject -> drop it, and say so in
//                `dropped` rather than silently. 9p21 is a real locus and a
//                researcher who wanted ANRIL deserves to know we cannot
//                follow it, not to find the suggestion quietly missing.
//   Unavailable  a transient upstream failure -> KEEP the suggestion. Dropping
//                it would turn someone else's 503 into a permanent hole.
//
// These lookups are our own resolver on the keyless path, and a repeated
// symbol is served from cache (§5.3), so the cost is one UniProt call per
// genuinely new suggested gene.
//
// The resolver's inability to open a non-coding gene is a real gap, recorded
// as a limitation rather than papered over here.
// ─────────────────────────────────────────────────────────────────────────
//
// The panels arrive in the request body because only the client knows which
// have finished. They are therefore caller-supplied: `suggest()` builds
// actions from a fixed table, from symbols matched against a strict pattern,
// and from URLs it checks are https — it never evaluates what it is given.

import { NextResponse } from 'next/server';
import { suggest, type Suggestion } from '@/lib/suggest';
import { resolve } from '@/lib/resolve';
import { NoEntry } from '@/lib/http';
import type { Identifiers, PanelResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { ids?: Identifiers; panels?: PanelResult[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const { ids, panels } = body;
  if (!ids || typeof ids !== 'object' || typeof ids.query !== 'string') {
    return NextResponse.json({ error: 'Pass the `ids` object returned by /api/resolve' }, { status: 400 });
  }
  if (panels !== undefined && !Array.isArray(panels)) {
    return NextResponse.json({ error: '`panels` must be an array of panel results' }, { status: 400 });
  }

  const proposed = suggest(ids, panels ?? []);

  const verdicts = await Promise.all(
    proposed.map(async (s): Promise<{ s: Suggestion; keep: boolean; why?: string }> => {
      if (s.kind !== 'query') return { s, keep: true };
      try {
        await resolve(s.query);
        return { s, keep: true };
      } catch (e) {
        if (e instanceof NoEntry) {
          return {
            s,
            keep: false,
            why:
              `${s.query} is named by a source but cannot be opened here: the resolver reads UniProt, ` +
              'which has no record for a non-coding gene. Look it up at the source instead.',
          };
        }
        // Transient. Offer it anyway rather than making a 503 look permanent.
        return { s, keep: true };
      }
    }),
  );

  return NextResponse.json({
    suggestions: verdicts.filter((v) => v.keep).map((v) => v.s),
    // Shown as a short line rather than hidden, so a gap is visible.
    dropped: verdicts
      .filter((v) => !v.keep)
      .map((v) => ({ query: v.s.kind === 'query' ? v.s.query : undefined, rule: v.s.rule, why: v.why })),
  });
}
