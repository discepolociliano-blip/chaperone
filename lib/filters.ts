// The filter vocabulary of eighteen databases, in one place, in funnel order.
// PROJECT-PLAN.md §11.8.
//
// WHY THIS EXISTS. The thing a researcher actually loses to fifteen browser
// tabs is not the queries — it is the FILTERS. Every one of these sites has its
// own facet rail, every rail uses different words for the same idea, and you
// re-apply the same four or five narrowings by hand on every site. Worse, you
// cannot know what a source will even let you narrow by until you are already
// on it. This file is that whole vocabulary, collected once.
//
// THE HONESTY PROBLEM, AND THE THREE MODES. A filter list is a promise: it says
// "you can narrow by this". Offering a narrowing we cannot actually perform
// would be the §5.4 failure wearing a new hat — the researcher would read a
// result as "filtered to pathogenic" when it was nothing of the kind. So every
// entry declares what Chaperone can really do with it:
//
//   'applied'  — we send it, the source honours it, VERIFIED by a probe that
//                the result CHANGES. Clicking it re-queries for real.
//   'pinned'   — we already send a fixed value and you cannot change it. These
//                are the invisible ones, and listing them is the point: you are
//                entitled to know that STRING and Reactome are restricted to
//                human before you read "no pathway found".
//   'handoff'  — the source has this facet but its API will not take it from
//                us. Clicking opens the source with the subject pre-filled, so
//                you filter there. §3.1's logic applied to facets: where we
//                cannot do it honestly, we send you to who can.
//
// NOTHING IS 'applied' ON FAITH. Each one was probed on 2026-11-09 by running
// the query with and without the filter and requiring the answer to differ,
// with a negative control where a bogus value had to NOT return everything.
// That caught the one entry people would most expect to work:
//
//   GWAS Catalog's p-value is 'handoff', not 'applied'. `p_upper` changes
//   nothing — and a deliberately invented parameter returns the same 8
//   associations as no filter at all. This API silently discards parameters it
//   does not recognise. It is the THIRD time this same API has done this to us
//   (`gene_name` and `rs_id` were the first two, see the M4 findings), and it
//   is the reason this file does not take any source's documentation on trust.
//
// ORDER. Filters appear in the funnel order of §11.2a, because the question
// "what can I narrow by" has the same shape as "what do I look at first".

import type { Layer } from './types';

export type FilterMode = 'applied' | 'pinned' | 'handoff';

export interface FilterOption {
  id: string;
  label: string;
  /** Passed to the connector. Shape is the connector's business. */
  value: string;
  hint?: string;
}

export interface FilterDef {
  id: string;
  /** What a researcher would call it, not what the API calls it. */
  label: string;
  layer: Layer;
  /** Connector ids this filter governs. Clicking it scopes to these. */
  connectors: string[];
  /** The source's own name for this facet, so you can find it over there. */
  sourceTerm: string;
  mode: FilterMode;
  /** For 'pinned': the value we fix, stated plainly. */
  pinned?: string;
  options?: FilterOption[];
  /** One sentence on why a researcher reaches for it. */
  because: string;
  /** How we established the source honours it — or does not. */
  evidence: string;
  /** For 'handoff': the deep link that opens the source's own facet rail. */
  deepLinkId?: string;
  /** Extra words that should match this filter in the search box. */
  synonyms?: string[];
}

export const FILTERS: FilterDef[] = [
  // ── 1. disease OR condition ────────────────────────────────────────────
  {
    id: 'clinvar-significance',
    label: 'Clinical significance',
    layer: 'condition',
    connectors: ['clinvar'],
    sourceTerm: 'Clinical significance',
    mode: 'applied',
    options: [
      { id: 'pathogenic', label: 'Pathogenic / likely pathogenic', value: '"clinsig pathogenic"[Properties]' },
      { id: 'vus', label: 'Uncertain significance', value: '"clinsig vus"[Properties]' },
      { id: 'benign', label: 'Benign / likely benign', value: '"clinsig benign"[Properties]' },
      { id: 'conflicting', label: 'Conflicting interpretations', value: '"clinsig conflicts"[Properties]' },
    ],
    because:
      'The raw submission count is dominated by variants nobody can interpret. Narrowing to pathogenic is the difference between "3,154 records" and "180 that mean something".',
    evidence:
      'Probed 2026-11-09: SCN9A returns 3,154 unfiltered and 180 for pathogenic. A bogus property returns 0, not everything, so it fails closed.',
    synonyms: ['pathogenic', 'benign', 'vus', 'uncertain', 'variant'],
  },
  {
    id: 'clinvar-review',
    label: 'Review status',
    layer: 'condition',
    connectors: ['clinvar'],
    sourceTerm: 'Review status (gold stars)',
    mode: 'applied',
    options: [
      { id: 'expert', label: 'Reviewed by expert panel', value: '"reviewed by expert panel"[Review Status]', hint: '3 gold stars' },
      { id: 'multiple', label: 'Multiple submitters, no conflicts', value: '"criteria provided, multiple submitters, no conflicts"[Review Status]', hint: '2 stars' },
      { id: 'single', label: 'Single submitter', value: '"criteria provided, single submitter"[Review Status]', hint: '1 star' },
    ],
    because:
      'A ClinVar record is only as good as who submitted it. An expert-panel assertion and a lone unreviewed submission both appear in the same count until you separate them.',
    evidence:
      'Probed 2026-11-09 with positive controls, because SCN9A returns 0 expert-panel records and zero alone cannot distinguish a working filter from a broken one: BRCA1 returns 3,434 and CFTR 396. SCN9A genuinely has none.',
    synonyms: ['stars', 'gold star', 'expert panel', 'curated', 'quality'],
  },
  {
    id: 'ot-evidence-type',
    label: 'Association evidence type',
    layer: 'condition',
    connectors: ['opentargets'],
    sourceTerm: 'Data type (genetic association, literature, animal model…)',
    mode: 'handoff',
    deepLinkId: 'omim',
    because:
      'An Open Targets score built from literature and animal models says how well studied a gene is; the genetic-association component is the one that speaks to human causality. The panel already breaks the score out, but you cannot re-rank by it here.',
    evidence:
      'Not offered as applied: the GraphQL schema supports datatype filtering, but we have not probed that it changes the ranking, and this file does not claim unprobed behaviour.',
    synonyms: ['genetic association', 'literature', 'animal model', 'score', 'evidence'],
  },

  // ── 2. target OR pathway OR biomarker ──────────────────────────────────
  {
    id: 'species',
    label: 'Species',
    layer: 'target',
    connectors: ['reactome', 'string', 'uniprot'],
    sourceTerm: 'species / organism / taxon',
    mode: 'pinned',
    pinned: 'Human (NCBI taxon 9606) only',
    because:
      'These three default to all species. We pin human, which is right for this toolkit and invisible on the panel — so a Reactome "no pathway" might mean no HUMAN pathway, while a mouse one exists.',
    evidence: 'Sent as `species=9606` on Reactome and STRING; UniProt searches reviewed human entries.',
    synonyms: ['human', 'organism', 'mouse', 'taxon', '9606'],
  },
  {
    id: 'string-score',
    label: 'Interaction confidence',
    layer: 'target',
    connectors: ['string'],
    sourceTerm: 'required_score',
    mode: 'applied',
    options: [
      { id: 'highest', label: 'Highest confidence', value: '900', hint: '≥ 0.900' },
      { id: 'high', label: 'High confidence', value: '700', hint: '≥ 0.700' },
      { id: 'medium', label: 'Medium confidence', value: '400', hint: '≥ 0.400' },
      { id: 'low', label: 'All reported', value: '150', hint: '≥ 0.150' },
    ],
    because:
      'A STRING score mixes experimental evidence with text mining. Raising the floor is how you separate "co-mentioned in abstracts" from "shown to interact".',
    evidence: 'Probed 2026-11-09: SCN9A returns 575 edges unfiltered and 94 at ≥900.',
    synonyms: ['confidence', 'score', 'interaction', 'partner', 'network'],
  },
  {
    id: 'string-neighbours',
    label: 'Partners returned',
    layer: 'target',
    connectors: ['string'],
    sourceTerm: 'limit',
    mode: 'pinned',
    pinned: 'Top 20 by confidence',
    because:
      'STRING has far more neighbours than we show. The panel says so, but the cap is ours, not the source\'s — this is where it is stated as a filter.',
    evidence: 'Sent as `limit` on the network call; the panel already discloses "the 20 highest-confidence neighbours we requested".',
    synonyms: ['limit', 'top', 'how many', 'neighbours'],
  },
  {
    id: 'gtex-tissue',
    label: 'Tissue',
    layer: 'target',
    connectors: ['gtex'],
    sourceTerm: 'Tissue (54 sites)',
    mode: 'handoff',
    deepLinkId: 'gxa',
    because:
      'Bulk tissue mixes every cell type present, so a low median does not rule out high expression in a rare cell type. Narrowing to one tissue is a question about that tissue, not about the gene.',
    evidence:
      'The panel already fetches all 54 tissues and ranks them, so a tissue filter here would narrow what you are shown rather than what was asked. Expression Atlas is the place to interrogate one tissue properly.',
    synonyms: ['tissue', 'brain', 'nerve', 'expression', 'organ'],
  },
  {
    id: 'hpa-celltype',
    label: 'Cell type',
    layer: 'target',
    connectors: ['hpa'],
    sourceTerm: 'Cell type / single cell / brain region',
    mode: 'handoff',
    deepLinkId: 'cellxgene',
    because:
      'HPA lists only the ENRICHED entries, not every cell type measured. To ask about a specific cell type you have to go where every cell type is queryable.',
    evidence: 'HPA serves one JSON record per gene with no cell-type parameter; the filtering happens in their web interface.',
    synonyms: ['cell type', 'single cell', 'neuron', 'glia', 'oligodendrocyte'],
  },

  // ── 3. drug OR compound OR therapeutic class ───────────────────────────
  {
    id: 'chembl-limit',
    label: 'Targets returned',
    layer: 'drug',
    connectors: ['chembl'],
    sourceTerm: 'limit',
    mode: 'pinned',
    pinned: 'First 20 matching targets',
    because:
      'A protein can appear in many ChEMBL target records — as a single protein, in families, in complexes. We take the first 20 and name the primary one.',
    evidence: 'Sent as `limit=20` on the target search.',
    synonyms: ['limit', 'compound', 'drug', 'target'],
  },

  // ── 4. mechanism OR efficacy OR safety ─────────────────────────────────
  {
    id: 'pdb-method',
    label: 'Experimental method',
    layer: 'mechanism',
    connectors: ['pdb'],
    sourceTerm: 'exptl.method',
    mode: 'applied',
    options: [
      { id: 'em', label: 'Cryo-electron microscopy', value: 'ELECTRON MICROSCOPY' },
      { id: 'xray', label: 'X-ray diffraction', value: 'X-RAY DIFFRACTION' },
      { id: 'nmr', label: 'Solution NMR', value: 'SOLUTION NMR' },
    ],
    because:
      'Method decides what a structure can tell you. A cryo-EM map of a full-length channel and a crystal of one isolated domain answer different questions.',
    evidence: 'Probed 2026-11-09: Q15858 returns 44 entries unfiltered and 41 restricted to cryo-EM.',
    synonyms: ['cryo-em', 'crystal', 'x-ray', 'nmr', 'structure', 'resolution'],
  },
  {
    id: 'gnomad-release',
    label: 'gnomAD release',
    layer: 'mechanism',
    connectors: ['gnomad'],
    sourceTerm: 'dataset / reference genome',
    mode: 'applied',
    options: [
      { id: 'r4', label: 'v4 (GRCh38)', value: 'gnomad_r4', hint: 'default — 730k exomes' },
      { id: 'r2', label: 'v2.1.1 (GRCh37)', value: 'gnomad_r2_1', hint: 'the legacy constraint most papers cite' },
    ],
    because:
      'Constraint scores differ between releases, and most published LOEUF values are v2. Comparing our number to a paper means knowing which release each came from.',
    evidence:
      'Probed 2026-11-09: SCN9A o/e LoF is 0.7005 on GRCh38 and 0.5489 on GRCh37 — the same gene, two defensible numbers.',
    synonyms: ['loeuf', 'pli', 'constraint', 'release', 'version', 'grch37', 'grch38'],
  },
  {
    id: 'depmap-essentiality',
    label: 'Gene essentiality',
    layer: 'mechanism',
    connectors: [],
    sourceTerm: 'Common essential / selective dependency',
    mode: 'handoff',
    deepLinkId: 'depmap',
    because:
      'This is the filter that flips sign between your two domains. A constrained, essential gene is a promising neuroscience target and a disqualifying host-directed antiviral one — knocking it down costs the patient.',
    evidence: 'DepMap is a deep link, not a panel (§6.3), so the filter lives there. Chaperone surfaces the question, not the answer.',
    synonyms: ['essential', 'dependency', 'crispr', 'knockout', 'safety'],
  },

  // ── 5. study type OR population ────────────────────────────────────────
  {
    id: 'gwas-pvalue',
    label: 'Significance threshold',
    layer: 'evidence',
    connectors: ['gwascatalog'],
    sourceTerm: 'p-value',
    mode: 'handoff',
    deepLinkId: 'finngen',
    because:
      'Genome-wide significance (5×10⁻⁸) is the line between a finding and a coincidence, and it is the first thing anyone filters a GWAS by.',
    evidence:
      'NOT applied, and this is a deliberate refusal. Probed 2026-11-09: `p_upper=5e-8` returns the same 8 associations as no filter, and so does a parameter we invented. This API discards unrecognised parameters silently — the same defect as its `gene_name` and `rs_id` (M4 findings). Offering it would mean showing you an unfiltered list labelled as filtered.',
    synonyms: ['p-value', 'significance', 'genome-wide', '5e-8', 'threshold'],
  },
  {
    id: 'gwas-ancestry',
    label: 'Ancestry',
    layer: 'evidence',
    connectors: ['gwascatalog'],
    sourceTerm: 'Ancestry / initial sample description',
    mode: 'handoff',
    deepLinkId: 'finngen',
    because:
      'A GWAS association found in one ancestry may not replicate in another, and the catalogue is heavily skewed toward European cohorts. Which population a finding came from changes what it means for a patient.',
    evidence: 'The v2 association endpoint returns no ancestry field and takes no ancestry parameter; it is held on the study record.',
    synonyms: ['ancestry', 'population', 'ethnicity', 'european', 'cohort', 'diversity'],
  },
  {
    id: 'dbsnp-population',
    label: 'Population frequency',
    layer: 'evidence',
    connectors: ['dbsnp'],
    sourceTerm: 'Per-study global MAF',
    mode: 'handoff',
    deepLinkId: 'allofus',
    because:
      'A variant that is rare in one population and common in another is a different clinical proposition in each. One global MAF hides that.',
    evidence: 'The dbSNP panel reports MAF across studies; selecting a population is done on the dbSNP record page and in the biobanks.',
    synonyms: ['maf', 'frequency', 'allele', 'population', 'rare', 'common'],
  },
];

/** The funnel order of §11.2a. Filters group under these, same as panels. */
export const FILTER_LAYER_ORDER: Layer[] = [
  'condition',
  'target',
  'drug',
  'mechanism',
  'evidence',
  'pathogen',
];

export function filtersForLayer(layer: Layer): FilterDef[] {
  return FILTERS.filter((f) => f.layer === layer);
}

export function filterById(id: string): FilterDef | undefined {
  return FILTERS.find((f) => f.id === id);
}

/**
 * Typeahead over the whole vocabulary.
 *
 * Matches the filter's own label, the SOURCE's word for it, its option labels
 * and its synonyms — because the researcher types the word the database taught
 * them, which is rarely the word we chose. "gold star" has to find ClinVar's
 * review status; "5e-8" has to find the GWAS threshold and then tell them we
 * cannot apply it.
 *
 * Order is never by score. It is always §11.2a order, so the list reads the
 * same way every time and the funnel stays visible even while narrowing.
 */
export function searchFilters(query: string): FilterDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FILTERS;
  const terms = q.split(/\s+/);

  return FILTERS.filter((f) => {
    const haystack = [
      f.label,
      f.sourceTerm,
      f.id,
      ...(f.synonyms ?? []),
      ...(f.options ?? []).flatMap((o) => [o.label, o.hint ?? '']),
      ...f.connectors,
    ]
      .join(' ')
      .toLowerCase();
    // Every term must appear somewhere, so adding a word narrows.
    return terms.every((t) => haystack.includes(t));
  });
}

/** The connectors a filter scopes the view to. Empty means it governs none. */
export function connectorsForFilter(id: string): string[] {
  return filterById(id)?.connectors ?? [];
}
