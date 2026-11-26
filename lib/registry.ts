// The single source of truth for what Chaperone can query.
// PROJECT-PLAN.md §9.3: the dashboard is generated from this list, so the UI
// and the inventory in §6 cannot drift apart. Adding a source is one new file
// in lib/connectors/ plus one line here.

import { uniprot } from './connectors/uniprot';
import { gnomad } from './connectors/gnomad';
import { clinvar } from './connectors/clinvar';
import { pdb } from './connectors/pdb';
import { alphafold } from './connectors/alphafold';
import { chembl } from './connectors/chembl';
import { reactome } from './connectors/reactome';
import { string } from './connectors/string';
import { intact } from './connectors/intact';
import { gtex } from './connectors/gtex';
import { hpa } from './connectors/hpa';
import { opentargets } from './connectors/opentargets';
import { gwascatalog } from './connectors/gwascatalog';
import { monarch } from './connectors/monarch';
import { hpo } from './connectors/hpo';
import { dbsnp } from './connectors/dbsnp';
import { bvbrc } from './connectors/bvbrc';
import { ncbivirus } from './connectors/ncbivirus';
import type { Connector, Identifiers, Layer, Preset } from './types';

// Grouped and ordered by the researcher's funnel (§11.2, reset 2026-11-09).
// Within a layer the order here is the order on screen, so the most direct
// answer to that layer's question comes first.
export const connectors: Connector[] = [
  // 1. disease OR condition — what is already known to go wrong, and in whom
  opentargets, // the ranked association list; the widest view of the disease link
  clinvar, // variants submitted against conditions, with the VUS fraction
  hpo, // the Mendelian diseases and their phenotype terms
  monarch, // gene–phenotype associations across model organisms

  // 2. target OR pathway OR biomarker — what the thing is, what it sits in,
  //    and where in the body it shows up
  uniprot, // the target itself: function, location, length
  reactome, // curated pathway membership
  string, // functional association neighbourhood
  intact, // physically reported binding partners
  gtex, // bulk tissue expression — the biomarker question at tissue scale
  hpa, // cell-type enrichment — the same question where bulk averages hide it

  // 3. drug OR compound OR therapeutic class
  chembl,

  // 4. mechanism OR efficacy OR safety — how it works, and what breaking it costs
  pdb, // experimental structure: the mechanism you can see
  alphafold, // the predicted one, where no experiment exists
  gnomad, // constraint: the safety signal, and the one that flips sign by domain

  // 5. study type OR population — the evidence base, and who it was measured in
  gwascatalog, // which studies, which traits, what significance
  dbsnp, // the variant itself and its population frequencies

  // Pathogen — organism context, not gene evidence (§11.6). Only ever renders
  // for an organism subject, so it cannot push gene panels down the page.
  ncbivirus,
  bvbrc,
];

// The researcher's funnel (see the `Layer` doc comment in types.ts for why
// this order and not the sources' own). Changing this line changes the
// dashboard, because PanelGrid reads it and nothing else decides order.
export const LAYER_ORDER: Layer[] = ['condition', 'target', 'drug', 'mechanism', 'evidence', 'pathogen'];

export const LAYER_LABEL: Record<Layer, string> = {
  condition: 'Disease & condition',
  target: 'Target, pathway & biomarker',
  drug: 'Drugs & compounds',
  mechanism: 'Mechanism & safety',
  evidence: 'Study type & population',
  pathogen: 'Pathogen',
};

export function byId(id: string): Connector | undefined {
  return connectors.find((c) => c.id === id);
}

/**
 * Which connectors can run with the identifiers we have.
 * A connector whose `requires` are unmet is omitted rather than shown failing:
 * "we could not look this up" is not one of the four states (§5.4), because
 * it is our limitation, not the source's answer.
 */
export function runnable(ids: Identifiers): Connector[] {
  return connectors.filter(
    (c) => c.requires.length === 0 || c.requires.some((group) => group.every((field) => Boolean(ids[field]))),
  );
}

/**
 * §11.2: one fixed order with filters. A preset narrows the set; it never
 * reorders it. Panels stay where the researcher learned to find them, and a
 * layout that rearranges itself between queries costs more in re-orientation
 * than it saves in scrolling.
 *
 * A connector with no presets is domain-neutral (identity, molecules) and
 * survives every filter.
 */
export function forPreset(list: Connector[], preset: Preset | null): Connector[] {
  if (!preset) return list;
  return list.filter((c) => c.presets.length === 0 || c.presets.includes(preset));
}
