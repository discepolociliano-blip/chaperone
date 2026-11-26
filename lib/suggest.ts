// The suggestion engine. PROJECT-PLAN.md §8.
//
// Rule-based navigation, not inference. Each rule reads facts the panels
// already returned and proposes a next action, labelled with the rule that
// produced it so a researcher can see why it was offered and ignore it.
//
// ─────────────────────────────────────────────────────────────────────────
// THE RULE THAT CONSTRAINS EVERY OTHER RULE.
//
// A suggestion whose action is "look at gene X" may only name a symbol that a
// source actually returned — a STRING or IntAct partner, a gene dbSNP mapped a
// variant to. Never one this code derived.
//
// The temptation is obvious and §8 even invites it: "an ion channel with
// pain-trait associations surfaces the pain preset AND ITS PARALOGUES". The
// cheap way to do that is to strip the digits off SCN9A and offer SCN1A…
// SCN11A. That is a generated biological claim dressed as navigation: the
// naming convention is not paralogy, HGNC roots are not families, and the
// numbers in between do not all exist. It is also the precise shape of the
// §6.5 failure — SCN8A for SCN9A, plausible, adjacent and wrong.
//
// So paralogues are reached through a link to a real family page, and every
// suggested symbol is one a database named. The honest cost: for a gene with
// no interaction data there are no related-gene suggestions. That is correct.
// ─────────────────────────────────────────────────────────────────────────
//
// §8 also promised "a tolerant gene with many VIRAL interactions surfaces the
// antiviral host-factor view". v1 has no virus-host interaction source — §11.6
// scoped those out — so the `tolerant-and-connected` rule fires on constraint
// plus interaction count and says exactly that in its `because`. It does not
// claim the partners are viral, because nothing here measured that.

import { PRESETS, presetsForTrait } from './presets';
import { extractSignals, type Signals } from './signals';
import type { Identifiers, PanelResult, Preset } from './types';

export type Suggestion =
  /** Run this as a new query. The string must be resolvable by `/api/resolve`. */
  | { kind: 'query'; query: string; label: string; rule: string; because: string }
  /** Apply this panel filter (§11.2 — it narrows, it never reorders). */
  | { kind: 'preset'; preset: Preset; label: string; rule: string; because: string }
  /** Open one of the §6.4 deep links. */
  | { kind: 'link'; deepLinkId: string; label: string; rule: string; because: string }
  /** Open a URL a panel itself returned. Never a URL assembled here. */
  | { kind: 'url'; href: string; label: string; rule: string; because: string };

const MAX_PARTNER_QUERIES = 3;
const WELL_CONNECTED = 5;
/** gnomAD's own conventional thresholds, described rather than applied as cliffs. */
const TOLERANT_LOEUF = 1;
const CONSTRAINED_LOEUF = 0.35;

const BRAIN_TISSUE = /brain|cortex|cerebell|hippocamp|nerve|pituitary|hypothalam|amygdala|nucleus|spinal/i;

/**
 * A `recordUrl` a panel returned, if it is one we can safely offer.
 *
 * Panels reach `suggest()` from the caller (the browser posts back the ones it
 * has loaded), so a `recordUrl` here is caller-supplied even though ours put
 * it there. Restricting it to https means a crafted request cannot turn a
 * suggestion into a `javascript:` or `data:` link.
 */
function panelUrl(panels: PanelResult[], id: string): string | undefined {
  const p = panels.find((x) => x.id === id);
  if (p?.state !== 'data' || !p.recordUrl) return undefined;
  try {
    return new URL(p.recordUrl).protocol === 'https:' ? p.recordUrl : undefined;
  } catch {
    return undefined;
  }
}

export function suggest(ids: Identifiers, panels: PanelResult[]): Suggestion[] {
  const s: Signals = extractSignals(ids, panels);
  const out: Suggestion[] = [];

  // ── 1. a variant's gene is the obvious next subject ────────────────────
  // dbSNP maps the rsID, or the GWAS Catalog supplies the context when dbSNP
  // is empty (its `geneSource` records which).
  if (ids.kind === 'rsid' && ids.variant?.genes.length) {
    // Skip the gene the resolver already resolved this variant TO: for
    // rs6746030 that is SCN9A, which is the subject on screen, and "open the
    // thing you are looking at" is noise dressed as a suggestion.
    const already = ids.symbol?.toUpperCase();
    const others = ids.variant.genes.filter((g) => g.toUpperCase() !== already);
    for (const g of others.slice(0, 2)) {
      out.push({
        kind: 'query',
        query: g,
        label: `Open ${g}`,
        rule: 'variant-to-gene',
        because: `${ids.variant.geneSource ?? 'the variant record'} maps ${ids.variant.rsid} to ${g}.`,
      });
    }
  }

  // ── 2. related genes, but only ones a source named ─────────────────────
  const partners = [...s.stringPartners, ...s.intactPartners.filter((p) => !s.stringPartners.includes(p))];
  for (const p of partners.slice(0, MAX_PARTNER_QUERIES)) {
    const from = s.stringPartners.includes(p) ? 'STRING' : 'IntAct';
    out.push({
      kind: 'query',
      query: p,
      label: `Open ${p}`,
      rule: 'interaction-partner',
      because:
        `${from} returned ${p} among the highest-confidence partners of ${ids.symbol ?? 'this gene'}. ` +
        (from === 'STRING'
          ? 'A STRING score combines experimental, database, co-expression and text-mining evidence and is not proof of a physical interaction.'
          : 'IntAct counts curated binary interaction reports.'),
    });
  }

  // ── 2b. a trait's strongest genes are where a trait search goes next ───
  // Before M7 a trait resolved to an EFO id that no panel could use, so
  // searching "neuropathic pain" produced a name and nowhere to go. These
  // symbols come from Open Targets, so they are a source's answer, not ours.
  if (ids.traitGenes?.length) {
    for (const g of ids.traitGenes.slice(0, MAX_PARTNER_QUERIES)) {
      out.push({
        kind: 'query',
        query: g,
        label: `Open ${g}`,
        rule: 'trait-to-gene',
        because:
          `Open Targets ranks ${g} among the genes most strongly associated with ` +
          `${ids.traitName ?? 'this trait'}` +
          `${ids.traitGeneCount ? `, out of ${ids.traitGeneCount.toLocaleString()} associated genes` : ''}. ` +
          'The score aggregates genetic, drug, pathway and text-mining evidence — it ranks ' +
          'strength of association, not causation.',
      });
    }
  }

  // ── 3. traits decide the preset ────────────────────────────────────────
  // Collected across sources first, so one preset is suggested once with the
  // evidence behind it rather than five times with a fragment each.
  const byPreset = new Map<Preset, { trait: string; from: string; matched: string }[]>();
  for (const t of s.traits) {
    for (const hit of presetsForTrait(t.name)) {
      const list = byPreset.get(hit.preset) ?? [];
      list.push({ trait: t.name, from: t.from, matched: hit.matched });
      byPreset.set(hit.preset, list);
    }
  }
  for (const [preset, hits] of byPreset) {
    const def = PRESETS.find((p) => p.id === preset);
    const shown = hits.slice(0, 3).map((h) => `"${h.trait}" (${h.from})`).join(', ');
    out.push({
      kind: 'preset',
      preset,
      label: `Filter to ${def?.label ?? preset}`,
      rule: 'trait-preset',
      because:
        `${hits.length} associated trait${hits.length === 1 ? '' : 's'} matched this preset's vocabulary — ` +
        `${shown}${hits.length > 3 ? ` and ${hits.length - 3} more` : ''}. ` +
        'Matched on the trait NAME as the source wrote it, not by walking EFO or MONDO, so judge the match yourself.',
    });
  }

  // ── 4. the pain preset carries the DRG strip (§11.5) ───────────────────
  if (byPreset.has('pain')) {
    out.push({
      kind: 'link',
      deepLinkId: 'drg-sensoryomics',
      label: 'Human DRG expression',
      rule: 'pain-needs-drg',
      because:
        'Pain-associated traits are present and the dorsal root ganglion is where nociceptor cell ' +
        'bodies sit. GTEx cannot answer this — it carries tibial nerve, which is axon, not soma — ' +
        'so this opens the DRG resource directly (§11.5).',
    });
  }

  // ── 5. an organism is a pathogen subject, not a gene ───────────────────
  if (ids.taxid) {
    out.push({
      kind: 'preset',
      preset: 'antiviral',
      label: 'Filter to Antiviral (host-directed)',
      rule: 'organism-resolved',
      because:
        `"${ids.query}" resolved to an organism (${ids.organismName ?? `taxid ${ids.taxid}`}` +
        `${ids.organismDivision ? `, NCBI division "${ids.organismDivision}"` : ''}), so the pathogen panels ` +
        'can run. Host-directed scope only (§11.6).',
    });
  }

  // ── 6. constraint, pointed at the two different questions it answers ───
  if (s.loeuf !== undefined && s.loeuf > TOLERANT_LOEUF && partners.length >= WELL_CONNECTED) {
    out.push({
      kind: 'preset',
      preset: 'antiviral',
      label: 'Filter to Antiviral (host-directed)',
      rule: 'tolerant-and-connected',
      because:
        `LOEUF ${s.loeuf} is above ${TOLERANT_LOEUF}, so loss of function appears tolerated, and ` +
        `${partners.length} high-confidence interaction partners were returned. A gene that can be ` +
        'knocked down without obvious cost, in a well-connected position, is the host-factor shape. ' +
        'Nothing here measured whether any partner is viral — v1 has no virus-host interaction source.',
    });
  }
  if (s.loeuf !== undefined && s.loeuf < CONSTRAINED_LOEUF) {
    out.push({
      kind: 'link',
      deepLinkId: 'depmap',
      label: 'Cross-check essentiality in DepMap',
      rule: 'constrained-check-essentiality',
      because:
        `LOEUF ${s.loeuf} is below ${CONSTRAINED_LOEUF} — strongly intolerant of loss of function, ` +
        'which makes it a poor thing to inhibit. DepMap cell-line dependency is an independent read ' +
        'on the same question from a different kind of evidence.',
    });
  }

  // ── 7. a structure gap, using the URL the panel itself returned ────────
  const afUrl = panelUrl(panels, 'alphafold');
  if (s.experimentalStructures === 0 && s.hasPredictedModel && afUrl) {
    out.push({
      kind: 'url',
      href: afUrl,
      label: 'Predicted structure (no experimental one exists)',
      rule: 'structure-gap',
      because:
        'The PDB holds no experimental structure for this protein, and AlphaFold has a predicted ' +
        'model. A prediction is a hypothesis about fold, not a measurement.',
    });
  }

  // ── 8. where the gene is expressed suggests whose question it is ───────
  if (s.topTissue && BRAIN_TISSUE.test(s.topTissue) && !byPreset.has('psych-neuro')) {
    out.push({
      kind: 'preset',
      preset: 'psych-neuro',
      label: 'Filter to Psychiatric & neuro',
      rule: 'nervous-system-expression',
      because:
        `GTEx reports highest median expression in ${s.topTissue}. Expression in a tissue is not ` +
        'evidence of a role in its diseases; it is a reason to look.',
    });
  }

  return dedupe(out);
}

/**
 * One action, suggested once. Two rules reaching the same preset is a real
 * situation — a tolerant gene with pain traits hits both #3 and #6 — and
 * showing the same button twice with different reasoning reads as a bug.
 * The first rule's reasoning wins and the second is appended, so neither
 * explanation is lost.
 */
function dedupe(list: Suggestion[]): Suggestion[] {
  const keyOf = (x: Suggestion) =>
    x.kind === 'query'
      ? `q:${x.query.toUpperCase()}`
      : x.kind === 'preset'
        ? `p:${x.preset}`
        : x.kind === 'link'
          ? `l:${x.deepLinkId}`
          : `u:${x.href}`;

  const seen = new Map<string, Suggestion>();
  for (const x of list) {
    const k = keyOf(x);
    const prior = seen.get(k);
    if (!prior) {
      seen.set(k, x);
      continue;
    }
    seen.set(k, {
      ...prior,
      rule: `${prior.rule} + ${x.rule}`,
      because: `${prior.because} Also: ${x.because}`,
    });
  }
  return [...seen.values()];
}
