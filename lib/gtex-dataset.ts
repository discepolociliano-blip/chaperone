// The GTEx dataset pairing, in one place because the two halves MUST match.
//
// Measured 2026-11-05 (M4). GTEx's two endpoints had drifted apart under us:
//
//   reference/gene          defaults to GENCODE v26  -> ENSG00000169432.14
//   expression/median…      defaults to gtex_v10     -> expects …432.19 (v39)
//
// So the id GTEx itself handed us was being queried against a dataset that had
// never heard of it. The result was **HTTP 200 with `data: []`** — no error, no
// warning, just an empty answer that reads as "GTEx has no expression data for
// this gene". For SCN9A that is flatly false: there are 54 tissues.
//
// This is the §6.5 hardcoded-identifier failure wearing a different coat. The id
// was correctly derived; what was hardcoded by omission was the *version* it
// belonged to. Two endpoints, two defaults, no shared assumption.
//
// Both halves are therefore pinned explicitly here, never left to a default.
// When GTEx next moves its default dataset, this file is the one edit, and the
// cross-check in connectors/gtex.ts turns a silent empty into a loud failure.
//
// v8 and v10 both return 54 tissues for SCN9A; v10 is current and larger.

/** Expression dataset. Must correspond to GTEX_GENCODE_VERSION below. */
export const GTEX_DATASET = 'gtex_v10';

/** The GENCODE release GTEX_DATASET is built on. */
export const GTEX_GENCODE_VERSION = 'v39';

/**
 * Strips a GENCODE version suffix.
 *
 * Needed because `reference/gene?geneId=ENSG00000169432.14&gencodeVersion=v39`
 * returns EMPTY — a suffix from the wrong release matches nothing. Unversioned
 * ids and bare symbols both resolve fine, so we always ask without a suffix and
 * let GTEx attach the one belonging to the pinned release.
 */
export function stripGencodeVersion(id: string): string {
  return id.split('.')[0] ?? id;
}
