// Shared shapes. See PROJECT-PLAN.md §5.4 (four states) and §6.5 (no hardcoded ids).

/** What the user typed, once we have classified it. */
export type InputKind =
  | 'symbol'
  | 'rsid'
  | 'uniprot'
  | 'ensembl'
  | 'pdb'
  | 'chembl'
  | 'coordinate'
  | 'text'
  | 'unknown';

/**
 * Canonical identifiers for one subject, derived by the resolver.
 *
 * §6.5: connectors MUST read ids from here and must never contain an id
 * literal. A wrong hardcoded HGNC id silently returned SCN8A for SCN9A
 * during gate 1 — plausible, adjacent, and completely wrong.
 */
export interface Identifiers {
  /** Exactly what the user typed, untouched. */
  query: string;
  kind: InputKind;
  /** Approved gene symbol, as the resolver's primary source reports it. */
  symbol?: string;
  proteinName?: string;
  uniprot?: string;
  /** Full CURIE, e.g. "HGNC:10597". */
  hgnc?: string;
  /** Bare NCBI Gene id, e.g. "6335". HPO needs "NCBIGene:6335". */
  ncbiGene?: string;
  /** Unversioned, e.g. "ENSG00000169432". */
  ensemblGene?: string;
  /** Versioned GENCODE id GTEx requires, e.g. "ENSG00000169432.14". */
  gencodeId?: string;
  transcripts?: string[];

  rsid?: string;
  /** Variant detail from dbSNP, when kind === 'rsid'. */
  variant?: VariantInfo;

  /** Free text, when kind === 'text'. */
  text?: string;
  /** EFO/MONDO id for a resolved trait, e.g. "EFO_0005762". */
  efoId?: string;
  traitName?: string;
  /**
   * Genes Open Targets associates with the trait, strongest first (§7.4).
   *
   * A trait used to resolve to an id and nothing else, which meant a trait
   * search produced a name and no biology — no panel takes an EFO id, so
   * nothing ran. These are measured symbols from a real source, which is the
   * only kind `suggest.ts` may offer as a next query.
   */
  traitGenes?: string[];
  /** How many associated targets exist in total, of which `traitGenes` is the head. */
  traitGeneCount?: number;

  /**
   * Organism, when free text names one. §11.6 scopes the pathogen panels to
   * "organism identification and context", so their subject is an organism
   * rather than a human gene — which is why a `text` query is resolved against
   * NCBI Taxonomy as well as against EFO.
   *
   * `taxid` is a bare id, e.g. "2697049". Derived, never a literal (§6.5).
   */
  taxid?: string;
  organismName?: string;
  /** e.g. "species", "isolate", "no rank". */
  organismRank?: string;
  /** NCBI division, e.g. "viruses" — reported so the panel's scope is visible. */
  organismDivision?: string;

  pdbId?: string;
  chemblId?: string;
  /** Normalised genomic coordinate, e.g. "2:166195185". */
  coordinate?: string;

  /**
   * Set when one input maps to several proteins — a PDB entry with multiple
   * polymer entities, or a ChEMBL protein complex. The resolver picks the
   * first as primary and records the rest here so the UI can say so rather
   * than pretending the choice was unambiguous.
   */
  alsoResolvesTo?: { accession: string; symbol?: string }[];
}

export interface VariantInfo {
  rsid: string;
  /** "9:22125504" */
  chrpos?: string;
  alleles?: string;
  snpClass?: string;
  clinicalSignificance?: string;
  /** Allele frequency from the largest-sample study dbSNP reports. */
  majorStudyMaf?: string;
  /** Genes dbSNP maps the variant to; empty for intergenic variants. */
  genes: string[];
  /** Where the gene context came from, since dbSNP is often empty. */
  geneSource?: 'dbSNP' | 'GWAS Catalog' | 'none';
}

/**
 * §5.4 — four states, because they mean different things to a researcher.
 *
 *  data          the source returned a record
 *  empty         the source works and genuinely has nothing for this subject
 *  unavailable   network error, 5xx, or timeout
 *  unconfigured  an optional API key is missing
 *
 * Gate 1 proved the data/empty split matters: the GWAS Catalog answers
 * `404 "snp with rs_id rs6746030 not found"` for a real rsID that merely has
 * no catalogued association. Rendering that as an error would tell a
 * researcher the lookup broke when in fact the answer is "nothing known".
 */
export type PanelState = 'data' | 'empty' | 'unavailable' | 'unconfigured';

/** One row of evidence in a panel. `href` links back to the source record (§5.5). */
export interface Fact {
  label: string;
  value: string;
  href?: string;
  /** Shown as a caveat under the value — e.g. that a number is derived. */
  note?: string;
}

export interface PanelResult {
  /** Connector id, matching the registry. */
  id: string;
  source: string;
  /** Home page of the source, for attribution. */
  sourceUrl: string;
  state: PanelState;
  /** ISO timestamp of the upstream fetch — not of this response (§5.4). */
  fetchedAt: string;
  cached: boolean;
  ms: number;
  /** Deep link to the specific record this panel describes. */
  recordUrl?: string;
  /** Explains empty / unavailable / unconfigured. Never shown for 'data'. */
  message?: string;
  facts?: Fact[];
  /**
   * The gene symbol this source believes it answered about.
   * The UI compares it against the resolved symbol and warns on mismatch
   * rather than rendering one gene's data under another's name (§7.6).
   */
  symbolSeen?: string;
}

/** Which biological layer a panel belongs to — drives dashboard grouping. */
/**
 * The order a researcher actually works in, not the order the data happens to
 * live in. Set 2026-11-09 from your query spine:
 *
 *   (disease OR condition)
 *   AND (target OR pathway OR biomarker)
 *   AND (drug OR compound OR therapeutic class)
 *   AND (mechanism OR efficacy OR safety)
 *   AND (study type OR population)
 *
 * This replaced `identity · molecules · pathways · cells · genetics · pathogen`,
 * which was the order the SOURCES fall into — structure and chemistry first,
 * disease last. Open Targets' own prioritisation puts tractability second to
 * last and treats genetics as the thing that gets you a target at all, and both
 * the neuroscience and host-directed antiviral literatures start from the
 * condition. Leading with molecules was leading with the answer to a question
 * nobody has asked yet.
 *
 * It also settles the one thing that differs between your two domains. A
 * constrained, essential gene is a promising neuro target and a disqualifying
 * antiviral one — the same number read two opposite ways. Starting from the
 * condition means the researcher has already said which reading applies before
 * reaching it, so no panel has to guess and no preset has to reorder (§11.2).
 *
 * `pathogen` is not in your five. It is organism context, not gene evidence,
 * and it only ever renders for an organism subject, so it sits last.
 */
export type Layer =
  | 'condition'
  | 'target'
  | 'drug'
  | 'mechanism'
  | 'evidence'
  | 'pathogen';

export type Preset = 'antiviral' | 'psych-neuro' | 'pain';

export interface ConnectorMeta {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  layer: Layer;
  /**
   * Identifier fields this connector needs, as OR-of-ANDs: the connector can
   * run if ANY inner group is fully satisfied. `[['uniprot'], ['symbol']]`
   * means "an accession, or failing that a symbol". `[]` means always.
   *
   * A flat AND-only list was the first design and it was wrong: it offered the
   * UniProt panel for an rsID query, which then reported 'empty' — telling the
   * researcher UniProt had no record when in truth we had nothing to query it
   * with. Those are different claims and only one of them is true (§5.4).
   */
  requires: (keyof Identifiers)[][];
  /** Presets that surface this panel first. Empty means always shown. */
  presets: Preset[];
  /** Per-source budget. Ensembl is capped low and kept off the critical path (§6.5). */
  timeoutMs: number;
  /** Env var this connector needs, if any. Absent key -> 'unconfigured'. */
  envKey?: string;
}

export interface Connector extends ConnectorMeta {
  run(ids: Identifiers, ctx: RunContext): Promise<Omit<PanelResult, 'id' | 'source' | 'sourceUrl' | 'ms'>>;
}

/**
 * A filter the researcher selected, on its way to the connector that honours
 * it. §11.8.
 *
 * Only ever set for a filter whose mode is 'applied' — one probed to change
 * the source's answer. A 'pinned' or 'handoff' filter never reaches here,
 * because the first is already in the request and the second cannot be.
 */
export interface ActiveFilter {
  /** `FilterDef.id` from lib/filters.ts. */
  filterId: string;
  /** `FilterOption.id`, for display. */
  optionId: string;
  /** `FilterOption.value` — the source's own syntax. */
  value: string;
}

export interface RunContext {
  /** Set by lib/http.ts when a response came from cache. */
  markCached(): void;
  /**
   * Present only when the researcher selected an applied filter that governs
   * THIS connector. A connector that ignores it renders an unfiltered answer
   * under a filtered heading, which is the §5.4 failure, so every connector
   * listed in a filter's `connectors` must honour it or not be listed.
   */
  filter?: ActiveFilter;
}
