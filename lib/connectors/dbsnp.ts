// The variant panel: dbSNP detail for an rsID.
//
// This calls the same resolveRsid() the resolver uses, deliberately. The URL is
// identical, so when the subject IS an rsID the resolver has already fetched it
// and this is a cache hit — one upstream request, reported honestly as cached
// (§5.4) rather than a second request or a fabricated timestamp. Sharing the
// parser also means there is only one place where dbSNP's shape is understood.

import { NoEntry, FetchMeta } from '../http';
import { resolveRsid } from '../dbsnp';
import type { Connector, Fact } from '../types';

export const dbsnp: Connector = {
  id: 'dbsnp',
  name: 'Variant detail',
  source: 'NCBI dbSNP',
  sourceUrl: 'https://www.ncbi.nlm.nih.gov/snp/',
  layer: 'evidence',
  requires: [['rsid']],
  presets: [],
  timeoutMs: 12000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.rsid) throw new NoEntry('No rsID', meta.provenance());

    const v = await resolveRsid(ids.rsid, this.timeoutMs, meta);

    const facts: Fact[] = [{ label: 'Variant', value: v.rsid }];

    if (v.chrpos) {
      facts.push({
        label: 'Position',
        value: v.chrpos,
        note: 'GRCh38. A position from a different build will not match.',
      });
    }
    if (v.alleles) facts.push({ label: 'Alleles', value: v.alleles });
    if (v.snpClass) facts.push({ label: 'Class', value: v.snpClass });

    if (v.majorStudyMaf) {
      facts.push({
        label: 'Allele frequency',
        value: v.majorStudyMaf,
        note:
          'From the largest-sample study dbSNP reports, named above. Frequencies differ ' +
          'substantially between populations, so one global figure can mislead.',
      });
    }

    if (v.clinicalSignificance) {
      facts.push({
        label: 'Clinical significance',
        value: v.clinicalSignificance,
        note: "dbSNP's aggregate of submitted assertions. The ClinVar panel carries the review status.",
      });
    }

    // Gene context is the field most likely to be absent, and its absence is
    // informative — an intergenic variant has no gene, which is a finding, not
    // a gap. Naming the source matters because it may be the GWAS Catalog
    // rather than dbSNP itself (§6.5).
    if (v.genes.length) {
      facts.push({
        label: 'Maps to',
        value: v.genes.join(', '),
        note:
          `Gene context from ${v.geneSource}.` +
          (v.genes.length > 1
            ? ' The variant maps to several genes; gene-level panels use the first.'
            : ''),
      });
    } else {
      facts.push({
        label: 'Maps to',
        value: 'No gene',
        note:
          'Neither dbSNP nor the GWAS Catalog places this variant in a gene — it is ' +
          'intergenic. Gene-level panels cannot run, which is the correct answer rather ' +
          'than a failure.',
      });
    }

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.ncbi.nlm.nih.gov/snp/${encodeURIComponent(v.rsid)}`,
      ...meta.get(),
    };
  },
};
