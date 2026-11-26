// AlphaFold predicted structure.
//
// §5.5: a prediction is not an experiment. The panel reports the model's own
// confidence and says plainly that low-confidence regions are often disordered
// rather than simply uncertain — a distinction that changes what the model
// means for a druggability question.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const API = 'https://alphafold.ebi.ac.uk/api/prediction';

interface Prediction {
  entryId?: string;
  uniprotAccession?: string;
  uniprotDescription?: string;
  gene?: string;
  uniprotSequence?: string;
  modelCreatedDate?: string;
  latestVersion?: number;
  pdbUrl?: string;
  cifUrl?: string;
}

export const alphafold: Connector = {
  id: 'alphafold',
  name: 'Predicted structure',
  source: 'AlphaFold DB',
  sourceUrl: 'https://alphafold.ebi.ac.uk/',
  layer: 'mechanism',
  requires: [['uniprot']],
  presets: [],
  timeoutMs: 10000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.uniprot) throw new NoEntry('No UniProt accession', meta.provenance());

    const { json } = meta.record(await fetchJson<Prediction[]>(`${API}/${ids.uniprot}`, {
      timeoutMs: this.timeoutMs,
      ttlMs: TTL.long,
      emptyOn: [404],
    }));

    const model = Array.isArray(json) ? json[0] : undefined;
    if (!model?.entryId) throw new NoEntry(`AlphaFold has no model for ${ids.uniprot}`, meta.provenance());

    const facts: Fact[] = [{ label: 'Model', value: model.entryId }];

    if (model.uniprotSequence?.length) {
      facts.push({ label: 'Residues modelled', value: `${model.uniprotSequence.length} aa` });
    }
    if (model.latestVersion != null) {
      facts.push({ label: 'Version', value: `v${model.latestVersion}` });
    }
    if (model.modelCreatedDate) {
      facts.push({ label: 'Created', value: model.modelCreatedDate });
    }

    facts.push({
      label: 'Interpretation',
      value: 'Predicted, not experimental',
      note: 'Per-residue pLDDT is on the AlphaFold page. Low-confidence stretches are frequently intrinsically disordered rather than merely uncertain — check before treating one as a pocket.',
    });

    return {
      state: 'data',
      facts,
      recordUrl: `https://alphafold.ebi.ac.uk/entry/${ids.uniprot}`,
      ...meta.get(),
      symbolSeen: model.gene ?? undefined,
    };
  },
};
