// Reading facts back out of rendered panels, for the rules in `suggest.ts`.
// PROJECT-PLAN.md §8.
//
// ─────────────────────────────────────────────────────────────────────────
// THIS FILE IS THE FRAGILE SEAM, AND IT IS DELIBERATELY FRAGILE IN ONE
// DIRECTION ONLY.
//
// Panels are built for a human reader: a fact is a label and a formatted
// string. Rules need numbers and symbols. Something has to parse one into the
// other, and parsing a display string is exactly the kind of coupling that
// rots — a connector tidies a label, and a rule silently stops firing.
//
// Two choices contain that:
//
//   1. Every extractor FAILS CLOSED. If the label is gone or the value does
//      not parse, the signal is simply absent and the rule does not fire. A
//      missing suggestion is a small loss; a suggestion built from a
//      misparsed number would be a fabricated finding (§5.5).
//
//   2. `scripts/probe.mjs` asserts that the expected signals ARE extracted for
//      known subjects. Fail-closed plus no test equals a rules layer that
//      quietly does nothing, which is worse than one that breaks loudly.
//
// The alternative — connectors returning structured signals alongside their
// facts — is better engineering and is noted as a v2 refactor. It would mean
// touching all eighteen connectors now, in the milestone whose job is rules.
// ─────────────────────────────────────────────────────────────────────────

import type { Identifiers, PanelResult, PanelState } from './types';

/** Labels that are headline numbers or caveats rather than entity names. */
const RESERVED: Record<string, string[]> = {
  opentargets: ['Associated diseases', 'Reading the score'],
  gwascatalog: ['Associations', 'Without a usable p-value', 'Rows discarded'],
  hpo: ['Diseases annotated to this gene', 'Further diseases', 'Phenotype terms', 'Terms'],
};

export interface Signals {
  /** gnomAD loss-of-function constraint upper bound. Lower = less tolerant. */
  loeuf?: number;
  pli?: number;
  /** Count of experimental structures from the PDB panel. 0 means "none", not "unknown". */
  experimentalStructures?: number;
  /** AlphaFold returned a predicted model. */
  hasPredictedModel: boolean;
  /** Gene symbols a source actually returned. Never inferred (see suggest.ts). */
  stringPartners: string[];
  intactPartners: string[];
  /** Trait and disease names, each tagged with the source that named it. */
  traits: { name: string; from: string }[];
  /** Highest-expression tissue label from GTEx, if the panel rendered. */
  topTissue?: string;
  /** Per-connector state, so a rule can tell "nothing there" from "never ran". */
  states: Record<string, PanelState>;
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

const SYMBOL = /^[A-Z][A-Z0-9][A-Z0-9-]{0,13}$/;

/**
 * Pull gene symbols out of a ` · `-joined display string, dropping the score
 * or count each carries: `"SCN1A (0.98) · SCN2A ×3"`.
 *
 * Anything that is not symbol-shaped is discarded rather than guessed at —
 * IntAct names partners by accession when it has no symbol, and an accession
 * offered as a "related gene" would resolve to the wrong thing or to nothing.
 */
function symbolList(value: string | undefined, exclude?: string): string[] {
  if (!value) return [];
  const skip = exclude?.toUpperCase();
  const out: string[] = [];
  for (const part of value.split('·')) {
    const name = part.replace(/\s*[(×].*$/, '').trim().toUpperCase();
    if (SYMBOL.test(name) && name !== skip && !out.includes(name)) out.push(name);
  }
  return out;
}

function panel(panels: PanelResult[], id: string): PanelResult | undefined {
  return panels.find((p) => p.id === id);
}

function factValue(p: PanelResult | undefined, label: string): string | undefined {
  return p?.facts?.find((f) => f.label === label)?.value;
}

/** For labels built with a count in them, e.g. STRING's `Top 8 associations…`. */
function factValueMatching(p: PanelResult | undefined, re: RegExp): string | undefined {
  return p?.facts?.find((f) => re.test(f.label))?.value;
}

/** Entity names that a connector renders AS fact labels, minus its own headings. */
function namesFromLabels(p: PanelResult | undefined, id: string): string[] {
  if (p?.state !== 'data') return [];
  const reserved = RESERVED[id] ?? [];
  return (p.facts ?? [])
    .map((f) => f.label)
    .filter((l) => !reserved.includes(l) && !/\bmore$/.test(l));
}

export function extractSignals(ids: Identifiers, panels: PanelResult[]): Signals {
  const states: Record<string, PanelState> = {};
  for (const p of panels) states[p.id] = p.state;

  const gnomad = panel(panels, 'gnomad');
  const pdb = panel(panels, 'pdb');
  const alphafold = panel(panels, 'alphafold');
  const string = panel(panels, 'string');
  const intact = panel(panels, 'intact');
  const gtex = panel(panels, 'gtex');
  const monarch = panel(panels, 'monarch');

  const traits: { name: string; from: string }[] = [];
  const addTraits = (names: string[], from: string) => {
    for (const n of names) {
      if (n && !traits.some((t) => t.name.toLowerCase() === n.toLowerCase())) traits.push({ name: n, from });
    }
  };

  addTraits(namesFromLabels(panel(panels, 'opentargets'), 'opentargets'), 'Open Targets');
  addTraits(namesFromLabels(panel(panels, 'gwascatalog'), 'gwascatalog'), 'GWAS Catalog');
  addTraits(namesFromLabels(panel(panels, 'hpo'), 'hpo'), 'HPO');
  // Monarch is the odd one out: it renders disease names as the VALUE of a
  // fixed label, not as labels. Treating it like the others returned 'Causal
  // for' as a disease name.
  if (monarch?.state === 'data') {
    const split = (v: string | undefined) => (v ? v.split('·').map((s) => s.trim()).filter(Boolean) : []);
    addTraits(split(factValue(monarch, 'Causal for')), 'Monarch (causal)');
    addTraits(split(factValue(monarch, 'Correlated with')), 'Monarch (correlated)');
  }

  return {
    loeuf: num(factValue(gnomad, 'LOEUF')),
    pli: num(factValue(gnomad, 'pLI')),
    // `empty` is a real answer of zero; `unavailable` leaves it unknown (§5.4).
    experimentalStructures:
      pdb?.state === 'data' ? num(factValue(pdb, 'Structures')) : pdb?.state === 'empty' ? 0 : undefined,
    hasPredictedModel: alphafold?.state === 'data',
    stringPartners: symbolList(
      factValueMatching(string, /^Top \d+ associations by confidence$/),
      ids.symbol,
    ),
    intactPartners: symbolList(factValue(intact, 'Partners'), ids.symbol),
    traits,
    topTissue: factValue(gtex, 'Highest median expression')?.split('·')[0]?.replace(/\s*\(.*$/, '').trim(),
    states,
  };
}
