// Deep links — pre-filled URLs, no API call. PROJECT-PLAN.md §6.4.
//
// These are the resources Chaperone deliberately does not query: some have no
// usable API (§6.3), some are licence-restricted, and some are controlled
// access where the researcher signs in themselves (§3.1). The point is that
// the researcher still never re-types an identifier.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY EVERY ENTRY CARRIES `lands` AND `verifiedBy`.
//
// A button labelled "DepMap → SCN9A" that silently drops the researcher on a
// generic search page is a small lie with a real cost: they look at an empty
// page and conclude the resource has nothing for this gene. That is the same
// failure as rendering `unavailable` for a 404 (§5.4) — our limitation
// presented as the source's answer.
//
// `lands` says what the URL actually opens:
//   record            the page for this exact subject
//   prefilled-search  a search page with the identifier already in the query
//   index             the resource's entry point; the researcher types the
//                     identifier there, because no per-subject URL exists
//
// `verifiedBy` says HOW that was established, which matters because five of
// these cannot be checked by a script at all (measured 2026-11-06):
//
//   fetch     a scripted GET returns the identifier in the HTML
//   browser   only a real browser sees it — the page is client-rendered, or
//             the site rejects non-browser clients. Checked by hand in the
//             browser, including a nonsense-identifier control.
//   blocked   the site answers automated clients with a bot challenge. Not
//             verifiable by us either way; a researcher's own browser passes.
//   signin    behind the researcher's own login (§3.1), so we see the wall
//   index     no per-subject URL exists, so there is nothing to verify
//
// This field is not documentation. `scripts/verify-deeplinks.mjs` reads it to
// decide what a given result MEANS, so the check flags a real regression and
// stays quiet about a limit it already knows it has. Without it the check
// reported nine failures of which only four were real, and a check that cries
// wolf gets ignored, which is how a genuinely dead link would survive.
//
// `index` links are kept rather than dropped — "here is the right tool, it
// cannot be addressed per gene" still beats leaving a researcher to find it —
// but they are never dressed up as record links.
// ─────────────────────────────────────────────────────────────────────────
//
// §6.5 applies here as everywhere: no identifier is a literal. Every URL is
// built from the resolver's `Identifiers`, and a link whose required
// identifier is missing is omitted rather than built with a blank.

import type { Identifiers, Layer, Preset } from './types';

export type Access =
  /** Public page, no sign-in. */
  | 'open'
  /** Public resource that requires the researcher's own account (§3.1). */
  | 'credentialed'
  /** Controlled access — this links to the application process, not to data. */
  | 'application';

export type Lands = 'record' | 'prefilled-search' | 'index';
export type VerifiedBy = 'fetch' | 'browser' | 'blocked' | 'signin' | 'index';

export interface DeepLink {
  id: string;
  /** Button text. */
  name: string;
  source: string;
  /**
   * Which stage of the funnel this resource answers (§11.2). Typed as `Layer`
   * rather than `string` since 2026-11-09: nothing reads it yet, but an
   * untyped hint drifts silently, and this one already had — it still held the
   * pre-funnel vocabulary after the layers were renamed.
   */
  layerHint: Layer;
  access: Access;
  lands: Lands;
  verifiedBy: VerifiedBy;
  /** Presets that surface this link. Empty means always. */
  presets: Preset[];
  /** OR-of-ANDs, as in `ConnectorMeta.requires`. `[]` means always buildable. */
  requires: (keyof Identifiers)[][];
  /** Built from ids; returns undefined when the identifier it needs is absent. */
  url(ids: Identifiers): string | undefined;
  /** Why this is a link and not a connector. Shown on hover. */
  note: string;
}

const enc = encodeURIComponent;

export const DEEP_LINKS: DeepLink[] = [
  // ── psychiatric & neuro ────────────────────────────────────────────────
  {
    id: 'schema',
    name: 'SCHEMA',
    source: 'Broad Institute',
    layerHint: 'evidence',
    access: 'open',
    lands: 'record',
    // A scripted GET returns a 1kB app shell — the SAME shell for a nonsense
    // gene id, so a 200 here proves nothing. In the browser the real record
    // renders and the control id renders "Gene not found". Checked 2026-11-06.
    verifiedBy: 'browser',
    presets: ['psych-neuro'],
    requires: [['ensemblGene']],
    url: (ids) => (ids.ensemblGene ? `https://schema.broadinstitute.org/gene/${enc(ids.ensemblGene)}` : undefined),
    note: 'Schizophrenia exome meta-analysis. Browser only — no public API.',
  },
  {
    id: 'bipex',
    name: 'BipEx',
    source: 'Broad Institute',
    layerHint: 'evidence',
    access: 'open',
    lands: 'record',
    /** Same app shell as SCHEMA; real record confirmed in the browser 2026-11-06. */
    verifiedBy: 'browser',
    presets: ['psych-neuro'],
    requires: [['ensemblGene']],
    url: (ids) => (ids.ensemblGene ? `https://bipex.broadinstitute.org/gene/${enc(ids.ensemblGene)}` : undefined),
    note: 'Bipolar disorder exome sequencing. Browser only — no public API.',
  },
  {
    id: 'finngen',
    name: 'FinnGen PheWeb',
    source: 'FinnGen',
    layerHint: 'evidence',
    // Measured 2026-11-06: the gene URL now redirects to Google OAuth
    // ("Sign in to continue to finngen.fi"). It was listed as open; it is not.
    access: 'credentialed',
    lands: 'record',
    verifiedBy: 'signin',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://results.finngen.fi/gene/${enc(ids.symbol)}` : undefined),
    note:
      'Summary-level PheWAS across the FinnGen cohort. Now behind a Google sign-in — you ' +
      'authenticate there yourself (§3.1), and the gene page opens after you do. ' +
      'Individual-level FinnGen data is separately controlled access.',
  },

  // ── pain (§11.5) ───────────────────────────────────────────────────────
  {
    id: 'hpgdb',
    name: 'Human Pain Genetics DB',
    source: 'humanpaingenetics.ca',
    layerHint: 'evidence',
    access: 'open',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['pain'],
    requires: [],
    // The host this pointed at, humanpaingeneticsdb.mcgill.ca, is NXDOMAIN as
    // of 2026-11-06 — not slow, not moved, gone. The database now lives under
    // the lab's own domain; /resources/ is the page that actually names it.
    url: () => 'https://www.humanpaingenetics.ca/resources/',
    note:
      'Curated human pain-genetics associations (Meloto et al. 2018) — SNP-to-pain-phenotype ' +
      'associations from manual literature review. A downloadable catalogue with no per-gene URL.',
  },
  {
    id: 'paingenes',
    name: 'Pain Genes DB',
    source: 'Mogil lab',
    layerHint: 'condition',
    access: 'open',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['pain'],
    requires: [],
    url: () => 'https://paingeneticslab.ca/4105/06_02_pain_genetics_database.asp',
    note: 'Transgenic mouse pain phenotypes. Catalogue, not an addressable database.',
  },
  {
    id: 'drg-sensoryomics',
    name: 'Human DRG RNA-seq',
    source: 'Sensoryomics (Price lab)',
    layerHint: 'target',
    access: 'open',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['pain'],
    requires: [],
    url: () => 'https://sensoryomics.shinyapps.io/RNA-Data/',
    note:
      'THE tissue for pain genetics and the gap GTEx leaves: GTEx carries tibial nerve, which is ' +
      'axon, not the nociceptor cell bodies in the dorsal root ganglion. A Shiny app — enter the ' +
      'gene symbol there. §11.5 made this a deep link rather than a connector.',
  },

  // ── cells & expression ─────────────────────────────────────────────────
  {
    id: 'cellxgene',
    name: 'CZ CELLxGENE',
    source: 'Chan Zuckerberg Initiative',
    layerHint: 'target',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://cellxgene.cziscience.com/gene-expression?genes=${enc(ids.symbol)}` : undefined),
    note: 'Single-cell expression across tissues. The Census has no REST surface for a per-request lookup (§6.3).',
  },
  {
    id: 'gxa',
    name: 'Expression Atlas',
    source: 'EMBL-EBI',
    layerHint: 'target',
    access: 'open',
    lands: 'record',
    // No response at all to a scripted GET — still nothing after 90s. In the
    // browser the same URL renders the gene across 50 experiments, promptly.
    // Verified 2026-11-06; do not "fix" this by raising a fetch timeout.
    verifiedBy: 'browser',
    presets: [],
    requires: [['ensemblGene']],
    url: (ids) => (ids.ensemblGene ? `https://www.ebi.ac.uk/gxa/genes/${enc(ids.ensemblGene)}` : undefined),
    note:
      'Every gene-level API endpoint tested returned 404 (§6.3) and the page does not answer ' +
      'scripted clients, but it works normally in a browser.',
  },
  {
    id: 'allenbrain',
    name: 'Allen Brain Map',
    source: 'Allen Institute',
    layerHint: 'target',
    access: 'open',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['psych-neuro'],
    requires: [],
    /** portal.brain-map.org redirects here (measured 2026-11-06). */
    url: () => 'https://brain-map.org/',
    note: 'Human and mouse brain expression atlases. Each atlas has its own browser; no unified per-gene URL.',
  },
  {
    id: 'depmap',
    name: 'DepMap',
    source: 'Broad Institute',
    layerHint: 'mechanism',
    access: 'open',
    lands: 'record',
    /** The one record link a script can confirm: a nonsense symbol returns a different page. */
    verifiedBy: 'fetch',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://depmap.org/portal/gene/${enc(ids.symbol)}?tab=overview` : undefined),
    note: 'Cancer cell-line dependency. Useful as an essentiality sanity check beside gnomAD constraint.',
  },
  {
    id: 'mpd',
    name: 'Mouse Phenome DB',
    source: 'JAX',
    layerHint: 'condition',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'fetch',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://phenome.jax.org/search?searchterm=${enc(ids.symbol)}` : undefined),
    note: 'Mouse strain phenotype measurements — the model-organism counterpart to the human panels.',
  },

  // ── pathways & pharmacology ────────────────────────────────────────────
  {
    id: 'wikipathways',
    name: 'WikiPathways',
    source: 'WikiPathways',
    layerHint: 'target',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://www.wikipathways.org/search.html?query=${enc(ids.symbol)}` : undefined),
    note:
      'Dropped as a connector because `findPathwaysByText.json` ignores its query — identical ' +
      'output for a real symbol and a nonsense one (§6.3). The site search itself works.',
  },
  {
    id: 'pharmgkb',
    name: 'PharmGKB (ClinPGx)',
    source: 'ClinPGx',
    layerHint: 'drug',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    // pharmgkb.org/search redirects to clinpgx.org/search — PharmGKB has been
    // folded into ClinPGx. Pointing at the destination rather than relying on
    // a redirect that may not outlive the rebrand. Measured 2026-11-06.
    url: (ids) => (ids.symbol ? `https://www.clinpgx.org/search?query=${enc(ids.symbol)}` : undefined),
    note:
      'Pharmacogenomics, now served as ClinPGx. Its API host no longer resolves and its terms ' +
      'restrict commercial use (§6.3, §10.1), so this is a link and nothing is fetched.',
  },
  {
    id: 'omim',
    name: 'OMIM',
    source: 'Johns Hopkins',
    layerHint: 'condition',
    access: 'open',
    lands: 'prefilled-search',
    // Cloudflare "performing security verification" for automated clients, in
    // a plain fetch and in an automated browser alike. A researcher's own
    // browser passes it. We cannot verify this link, and we do not pretend to.
    verifiedBy: 'blocked',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://www.omim.org/search?search=${enc(ids.symbol)}` : undefined),
    note: 'Mendelian phenotypes. The API needs a per-person key (§6.2); the search page does not.',
  },
  {
    id: 'decipher',
    name: 'DECIPHER',
    source: 'Wellcome Sanger',
    layerHint: 'condition',
    access: 'open',
    lands: 'record',
    /** HTTP 500 to a scripted GET; the identical URL renders the full record in a browser (2026-11-06). */
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    url: (ids) => (ids.symbol ? `https://www.deciphergenomics.org/gene/${enc(ids.symbol)}/overview/clinical-info` : undefined),
    note: 'Developmental-disorder variants. Patient-level records require a clinical account.',
  },

  // ── pathogen (§11.6: organism context only) ────────────────────────────
  {
    id: 'nextstrain',
    name: 'Nextstrain',
    source: 'Nextstrain',
    layerHint: 'pathogen',
    access: 'open',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['antiviral'],
    requires: [['taxid']],
    url: (ids) => (ids.taxid ? 'https://nextstrain.org/pathogens' : undefined),
    note:
      'Real-time pathogen phylogenies. Builds are curated per pathogen under their own paths, so ' +
      'there is no taxid-addressable URL — this lands on the build index. Shown only once an ' +
      'organism has resolved, so it never appears for a human gene query.',
  },
  {
    id: 'gisaid',
    name: 'GISAID',
    source: 'GISAID',
    layerHint: 'pathogen',
    access: 'credentialed',
    lands: 'index',
    verifiedBy: 'index',
    presets: ['antiviral'],
    requires: [['taxid']],
    url: (ids) => (ids.taxid ? 'https://gisaid.org/' : undefined),
    note: 'Terms forbid programmatic use here and require per-user registration (§6.3). Sign in with your own account.',
  },

  // ── the open way into controlled-access material (added 2026-11-19) ────
  //
  // PheGenI is NCBI's Phenotype-Genotype Integrator: the open, gene-addressable
  // report over the GWAS associations and eQTLs that the controlled dbGaP
  // studies produced. It answers the question a researcher actually has when a
  // dbGaP button appears — "is there anything in there for MY gene, before I
  // spend three months on a Data Use Certification" — which an application
  // homepage cannot answer at all.
  //
  // VERIFIED BY HAND, 2026-11-19, because a scripted fetch CANNOT judge this
  // page and nearly reported the opposite. curl sees 68kB with the symbol
  // present for SCN9A — and also for ZZZZQQQQ, which appears 7 times in its own
  // 64kB, because the page echoes the query back into its form. No `phs`
  // accession appears in ANY fetched body: the results tables are filled in by
  // JS after load. "Symbol in body" was measuring an echo, not data. In a real
  // browser the three states separate cleanly, which is why this link is
  // trusted at all:
  //
  //   SCN9A     Genes 1 of 1 · Association Results 5 of 5 · SNPs 74,761 ·
  //             eQTL 46 · study accessions phs000342 and phs000215 named
  //   OR4F5     Genes 1 of 1 · Association Results "No data found"
  //             → a real gene with a genuine absence (§5.4 state 2)
  //   ZZZZQQQQ  Genes "No data found" → not a gene at all
  //
  // So PheGenI tells "no entry" apart from "no such gene" by itself, and the
  // note below tells the researcher how to read that rather than leaving an
  // empty table to be misread as a dead link.
  //
  // Takes the SYMBOL, not the GeneID: `?gene=6335` returns 200 with no gene
  // record at all — the same silently-ignored-parameter trap as the GWAS
  // Catalog's `?gene_name=` (§6.1). Only `ids.symbol` is ever sent.
  {
    id: 'phegeni',
    name: 'PheGenI (dbGaP)',
    source: 'NCBI',
    layerHint: 'evidence',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    url: (ids) =>
      ids.symbol
        ? `https://www.ncbi.nlm.nih.gov/gap/phegeni?tab=1&gene=${enc(ids.symbol)}`
        : undefined,
    note:
      'Open, no sign-in. The GWAS associations, SNPs and eQTLs that the controlled dbGaP studies ' +
      'produced, filtered to this gene, with the phs study accessions named — read this before ' +
      'applying for dbGaP access. Results load in the browser, so only a browser sees them. ' +
      '"Genes 1 of 1" with no association results means a real gene with nothing catalogued, ' +
      'not a broken link.',
  },

  // All of Us Data Browser — the same shape as PheGenI above: the open,
  // gene-addressable, aggregate view of a resource whose individual-level data
  // is controlled. Allele frequencies over 535,680 short-read WGS participants
  // in a deliberately ancestrally diverse US cohort, which is the axis gnomAD
  // is weakest on, so this is not a second copy of the gnomAD panel.
  //
  // VERIFIED BY HAND, 2026-11-21, with a nonsense control. A scripted fetch is
  // useless here too: this is a client-rendered SPA serving the same ~2.3 kB
  // shell for every path. The first path tried, `/variants/{gene}`, was a GUESS
  // AND WAS WRONG — it returns that shell and nothing else, which is precisely
  // how a made-up URL scheme survives a check that only reads status codes. The
  // real scheme was found by driving the UI and watching where it went:
  //
  //   BRCA2      49,410 variants + full allele-frequency table
  //   SCN9A     105,403 variants + table
  //   OR4F5      10,509 variants + table — an obscure real gene still has data
  //   ZZZZQQQQ        0 variants, no table, falls back to the query prompt
  //
  // So unlike PheGenI, "0" here is unambiguous: every real gene carries
  // variation across half a million sequenced genomes, so zero means the symbol
  // is not a gene — never that the cohort has nothing to say about it. Direct
  // URL navigation was confirmed, not just clicking through from the search box.
  {
    id: 'allofus-browser',
    name: 'All of Us Data Browser',
    source: 'NIH / All of Us',
    layerHint: 'evidence',
    access: 'open',
    lands: 'prefilled-search',
    verifiedBy: 'browser',
    presets: [],
    requires: [['symbol']],
    url: (ids) =>
      ids.symbol
        ? `https://databrowser.researchallofus.org/snvsindels/${enc(ids.symbol)}`
        : undefined,
    note:
      'Open, no sign-in. Allele counts and frequencies for this gene across 535,680 short-read ' +
      'whole genomes in the All of Us cohort, with ClinVar significance and consequence per ' +
      'variant — an ancestrally diverse US population, which is where gnomAD is thinnest. ' +
      'Aggregate only: individual-level data stays in the controlled Researcher Workbench. ' +
      'The table is drawn in the browser, so only a browser sees it.',
  },

  // ── controlled access: these link to the application, not to data ──────
  {
    id: 'ukbiobank',
    name: 'UK Biobank',
    source: 'UK Biobank',
    layerHint: 'evidence',
    access: 'application',
    lands: 'index',
    verifiedBy: 'index',
    presets: [],
    requires: [],
    /** /enable-your-research/apply-for-access now redirects here (measured 2026-11-06). */
    url: () => 'https://www.ukbiobank.ac.uk/use-our-data/apply-for-access/',
    note: 'Controlled access. Out of scope by §3 — this is the access-application route, with your own credentials (§3.1).',
  },
  {
    id: 'dbgap',
    name: 'dbGaP',
    source: 'NCBI',
    layerHint: 'evidence',
    access: 'application',
    lands: 'index',
    verifiedBy: 'index',
    presets: [],
    requires: [],
    /** www.ncbi.nlm.nih.gov/gap/ redirects here (measured 2026-11-06). */
    url: () => 'https://dbgap.ncbi.nlm.nih.gov/home/',
    note:
      'Controlled-access genotype/phenotype studies. Requires a Data Use Certification via your ' +
      'institution. This opens the application route, not data — use the PheGenI link above to ' +
      'see what these studies hold for this gene first, since that needs no credentials.',
  },
  {
    id: 'allofus',
    name: 'All of Us',
    source: 'NIH',
    layerHint: 'evidence',
    access: 'application',
    lands: 'index',
    verifiedBy: 'index',
    presets: [],
    requires: [],
    url: () => 'https://www.researchallofus.org/',
    note:
      'Controlled access through the Researcher Workbench. Registration and training are ' +
      'per-person. This opens the registration route, not data — the All of Us Data Browser ' +
      'link above already gives this gene aggregate allele frequencies with no credentials.',
  },
];

export function deepLinkById(id: string): DeepLink | undefined {
  return DEEP_LINKS.find((l) => l.id === id);
}

/**
 * The links that can be built for this subject, optionally narrowed by preset.
 *
 * Mirrors `registry.runnable` + `registry.forPreset` deliberately: a link whose
 * identifier is missing is omitted, not rendered dead. §11.2 applies here too —
 * a preset filters the strip, it does not reorder it.
 */
export function availableLinks(
  ids: Identifiers,
  preset: Preset | null = null,
): { link: DeepLink; href: string }[] {
  return DEEP_LINKS.filter(
    (l) => l.requires.length === 0 || l.requires.some((group) => group.every((f) => Boolean(ids[f]))),
  )
    .filter((l) => !preset || l.presets.length === 0 || l.presets.includes(preset))
    .map((l) => ({ link: l, href: l.url(ids) }))
    .filter((x): x is { link: DeepLink; href: string } => Boolean(x.href));
}
