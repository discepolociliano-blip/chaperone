// Open Targets — gene-to-disease associations with evidence broken out by type.
//
// This is the closest thing in the inventory to §1's "unbiased finding tool":
// it ranks diseases associated with a gene and says WHICH KIND of evidence
// supports each, which matters because a score driven by text-mining means
// something very different from one driven by genetic association.
//
// So the panel never shows a bare score. It shows the composite alongside its
// genetic-association component, and says what the number is and is not.

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const GQL = 'https://api.platform.opentargets.org/api/v4/graphql';

const QUERY = `query Chaperone($ensemblId: String!) {
  target(ensemblId: $ensemblId) {
    approvedSymbol
    approvedName
    associatedDiseases(page: { index: 0, size: 10 }) {
      count
      rows {
        score
        datatypeScores { id score }
        disease { id name }
      }
    }
  }
}`;

interface DatatypeScore {
  id?: string;
  score?: number;
}

interface Row {
  score?: number;
  datatypeScores?: DatatypeScore[];
  disease?: { id?: string; name?: string };
}

interface GqlResponse {
  data?: {
    target?: {
      approvedSymbol?: string;
      approvedName?: string;
      associatedDiseases?: { count?: number; rows?: Row[] };
    } | null;
  };
  errors?: { message?: string }[];
}

function geneticScore(row: Row): number | undefined {
  const g = row.datatypeScores?.find((d) => d.id === 'genetic_association');
  return typeof g?.score === 'number' ? g.score : undefined;
}

export const opentargets: Connector = {
  id: 'opentargets',
  name: 'Disease associations',
  source: 'Open Targets',
  sourceUrl: 'https://platform.opentargets.org/',
  layer: 'condition',
  requires: [['ensemblGene']],
  presets: [],
  timeoutMs: 12000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.ensemblGene) throw new NoEntry('No Ensembl gene id', meta.provenance());

    const { json } = meta.record(
      await fetchJson<GqlResponse>(GQL, {
        timeoutMs: this.timeoutMs,
        ttlMs: TTL.standard,
        method: 'POST',
        body: { query: QUERY, variables: { ensemblId: ids.ensemblGene } },
        cacheKey: `opentargets ${ids.ensemblGene}`,
      }),
    );

    // GraphQL reports failures in the body with HTTP 200, so a non-empty
    // `errors` array is a real failure that must not read as "no data".
    if (json.errors?.length) {
      throw new NoEntry(`Open Targets: ${json.errors[0]?.message ?? 'query rejected'}`, meta.provenance());
    }

    const target = json.data?.target;
    if (!target) throw new NoEntry(`Open Targets has no target for ${ids.ensemblGene}`, meta.provenance());

    const count = target.associatedDiseases?.count ?? 0;
    const rows = (target.associatedDiseases?.rows ?? []).filter((r) => r.disease?.name);
    if (!count || !rows.length) {
      throw new NoEntry(`Open Targets associates no disease with ${target.approvedSymbol ?? ids.ensemblGene}`, meta.provenance());
    }

    const facts: Fact[] = [
      {
        label: 'Associated diseases',
        value: count.toLocaleString(),
        note:
          'The full ranked list, not a filtered subset. Most entries carry weak or indirect ' +
          'evidence; the scores below are what separate them.',
      },
    ];

    for (const row of rows.slice(0, 5)) {
      const name = row.disease?.name ?? '—';
      const overall = typeof row.score === 'number' ? row.score.toFixed(2) : '—';
      const gen = geneticScore(row);
      const kinds = (row.datatypeScores ?? [])
        .filter((d) => d.id && typeof d.score === 'number')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .map((d) => `${d.id?.replace(/_/g, ' ')} ${(d.score ?? 0).toFixed(2)}`)
        .join(', ');

      facts.push({
        label: name,
        value: `overall ${overall}${gen != null ? ` · genetic association ${gen.toFixed(2)}` : ''}`,
        href: row.disease?.id
          ? `https://platform.opentargets.org/evidence/${encodeURIComponent(ids.ensemblGene)}/${encodeURIComponent(row.disease.id)}`
          : undefined,
        note: kinds ? `Evidence: ${kinds}` : undefined,
      });
    }

    facts.push({
      label: 'Reading the score',
      value: '0–1, a weighted sum of evidence',
      note:
        'Not a probability and not a causal claim. A high score built from literature and ' +
        'animal-model evidence can reflect how much a gene has been studied; the genetic ' +
        'association component is the one that speaks to human causality.',
    });

    return {
      state: 'data',
      facts,
      recordUrl: `https://platform.opentargets.org/target/${encodeURIComponent(ids.ensemblGene)}/associations`,
      ...meta.get(),
      symbolSeen: target.approvedSymbol,
    };
  },
};
