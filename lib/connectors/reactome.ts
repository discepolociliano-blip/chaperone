// Curated pathways from Reactome, mapped from the UniProt accession.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const MAPPING = 'https://reactome.org/ContentService/data/mapping/UniProt';

interface ReactomePathway {
  stId?: string;
  displayName?: string;
  isInDisease?: boolean;
  isInferred?: boolean;
  speciesName?: string;
}

export const reactome: Connector = {
  id: 'reactome',
  name: 'Pathways',
  source: 'Reactome',
  sourceUrl: 'https://reactome.org/',
  layer: 'target',
  requires: [['uniprot']],
  presets: [],
  timeoutMs: 10000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.uniprot) throw new NoEntry('No UniProt accession', meta.provenance());

    const { json } = meta.record(await fetchJson<ReactomePathway[]>(
      `${MAPPING}/${ids.uniprot}/pathways?species=9606`,
      { timeoutMs: this.timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
    ));

    const pathways = (json ?? []).filter((p) => p.displayName);
    if (!pathways.length) throw new NoEntry(`Reactome maps no human pathway to ${ids.uniprot}`, meta.provenance());

    const disease = pathways.filter((p) => p.isInDisease);
    const inferred = pathways.filter((p) => p.isInferred);

    const facts: Fact[] = [
      { label: 'Pathways', value: String(pathways.length) },
      {
        label: 'Members',
        value: pathways
          .slice(0, 6)
          .map((p) => p.displayName)
          .join(' · '),
        note: pathways.length > 6 ? `Showing 6 of ${pathways.length}` : undefined,
      },
    ];

    if (disease.length) {
      facts.push({
        label: 'Disease pathways',
        value: `${disease.length} — ${disease.slice(0, 3).map((p) => p.displayName).join(' · ')}`,
      });
    }

    // §5.5: an inferred annotation is projected from another species by
    // orthology, not curated for human. Saying so matters.
    if (inferred.length) {
      facts.push({
        label: 'Inferred',
        value: String(inferred.length),
        note: 'Projected by orthology from another species rather than curated directly for human.',
      });
    }

    const top = pathways[0];

    return {
      state: 'data',
      facts,
      recordUrl: top?.stId
        ? `https://reactome.org/content/detail/${top.stId}`
        : `https://reactome.org/content/query?q=${ids.uniprot}`,
      ...meta.get(),
    };
  },
};
