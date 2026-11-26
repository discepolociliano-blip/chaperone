// Median expression across GTEx tissues.
//
// The dataset and GENCODE release are pinned together in lib/gtex-dataset.ts.
// Read the comment there before changing anything here: these two endpoints
// defaulted to different releases, which produced an empty result for a gene
// with 54 tissues of data.

import { fetchJson, NoEntry, Unavailable, FetchMeta } from '../http';
import { TTL } from '../cache';
import { GTEX_DATASET, GTEX_GENCODE_VERSION } from '../gtex-dataset';
import type { Connector, Fact } from '../types';

const API = 'https://gtexportal.org/api/v2/expression/medianGeneExpression';

interface MedianRow {
  median?: number;
  tissueSiteDetailId?: string;
  ontologyId?: string;
  datasetId?: string;
  gencodeId?: string;
  geneSymbol?: string;
  unit?: string;
}

interface MedianResponse {
  data?: MedianRow[];
}

/** "Brain_Anterior_cingulate_cortex_BA24" is not a label for a human. */
function tissueLabel(id: string): string {
  return id.replace(/_/g, ' ').trim();
}

export const gtex: Connector = {
  id: 'gtex',
  name: 'Tissue expression',
  source: 'GTEx',
  sourceUrl: 'https://gtexportal.org/',
  layer: 'target',
  requires: [['gencodeId']],
  presets: [],
  timeoutMs: 15000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.gencodeId) throw new NoEntry('No GENCODE id', meta.provenance());

    const { json } = meta.record(
      await fetchJson<MedianResponse>(
        `${API}?gencodeId=${encodeURIComponent(ids.gencodeId)}` +
          `&datasetId=${GTEX_DATASET}&itemsPerPage=250`,
        { timeoutMs: this.timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
      ),
    );

    const rows = (json.data ?? []).filter(
      (r): r is MedianRow & { tissueSiteDetailId: string; median: number } =>
        typeof r.tissueSiteDetailId === 'string' && typeof r.median === 'number',
    );

    // GTEx answers an unknown gencodeId with 200 + an empty array. Since the id
    // we pass was derived from GTEx's OWN gene record under the pinned release,
    // an empty answer here cannot mean "this gene has no expression data" — it
    // means the two halves have drifted apart again. Reporting that as `empty`
    // would publish a false biological negative, so it is `unavailable` with
    // the reason (§5.4).
    if (!rows.length) {
      throw new Unavailable(
        `GTEx returned no tissues for ${ids.gencodeId} in ${GTEX_DATASET}. ` +
          `The id and the dataset have drifted apart — check GTEX_DATASET and ` +
          `GTEX_GENCODE_VERSION in lib/gtex-dataset.ts against GTEx's current defaults.`,
        meta.provenance(),
      );
    }

    // The rows echo back the dataset and id they answered for. Free cross-check.
    const wrongDataset = rows.find((r) => r.datasetId && r.datasetId !== GTEX_DATASET);
    const wrongGene = rows.find((r) => r.gencodeId && r.gencodeId !== ids.gencodeId);

    const ranked = [...rows].sort((a, b) => b.median - a.median);
    const unit = rows.find((r) => r.unit)?.unit ?? 'TPM';
    const top = ranked.slice(0, 8);

    const detected = rows.filter((r) => r.median > 0).length;

    const facts: Fact[] = [
      {
        label: 'Tissues measured',
        value: String(rows.length),
        note: `${detected} with median above zero. ${GTEX_DATASET}, bulk RNA-seq, median ${unit} per tissue.`,
      },
      {
        label: `Highest median expression`,
        value: top
          .map((r) => `${tissueLabel(r.tissueSiteDetailId)} (${r.median.toFixed(1)})`)
          .join(' · '),
        note:
          `Median ${unit} across donors. Bulk tissue mixes every cell type present, so a ` +
          `low bulk median does not rule out high expression in a rare cell type — ` +
          `compare the Human Protein Atlas single-cell panel.`,
      },
    ];

    const lowest = ranked[ranked.length - 1];
    if (lowest && lowest.median === 0) {
      const zeros = rows.filter((r) => r.median === 0).length;
      facts.push({
        label: 'Not detected',
        value: `${zeros} tissue${zeros === 1 ? '' : 's'} at median 0`,
      });
    }

    // Required by the GTEx data licence, re-read 2026-11-06 (§5.6). A
    // redistributor must either "maintain the most current version of all
    // distributed data, or make known in a clear and conspicuous manner that
    // the products/services/applications do not reflect the most current/
    // accurate data available from the GTEx Portal".
    //
    // Chaperone pins the dataset deliberately (see lib/gtex-dataset.ts — the
    // two endpoints default to different GENCODE releases and silently return
    // an empty result when they disagree), so by construction it may lag the
    // newest GTEx release. That makes the second branch of the clause the one
    // that applies, and it has to be stated on the panel rather than buried.
    facts.push({
      label: 'Dataset release',
      value: `${GTEX_DATASET} · GENCODE ${GTEX_GENCODE_VERSION}`,
      note:
        'Chaperone pins this release so both GTEx endpoints agree; GTEx may since have published ' +
        'a newer one, so these figures are not necessarily the most current available from the ' +
        'GTEx Portal. The GTEx Portal does not endorse Chaperone.',
    });

    if (wrongDataset || wrongGene) {
      facts.push({
        label: 'Provenance warning',
        value: 'GTEx answered for a different dataset or gene than requested',
        note:
          `Requested ${ids.gencodeId} in ${GTEX_DATASET}; received ` +
          `${wrongGene?.gencodeId ?? ids.gencodeId} in ${wrongDataset?.datasetId ?? GTEX_DATASET}. ` +
          `Treat these numbers as unverified.`,
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://gtexportal.org/home/gene/${encodeURIComponent(ids.symbol ?? ids.gencodeId)}`,
      ...meta.get(),
      symbolSeen: rows.find((r) => r.geneSymbol)?.geneSymbol,
    };
  },
};
