// Sequence availability for an organism, via NCBI nuccore.
//
// §11.6: organism identification and context only. No viral protein
// structures, no direct-acting antiviral chemistry.
//
// ─────────────────────────────────────────────────────────────────────────
// A WORD ABOUT THE NUMBER THIS PANEL RETURNS.
//
// Measured 2026-11-06: SARS-CoV-2 returns 9,225,310 nucleotide sequences and
// Zika virus 3,424 — a ratio of roughly 2700:1 that says almost nothing about
// the viruses. It records how much genomic surveillance was funded, and when.
//
// (The first draft of this comment guessed "Zika ~22 thousand". It is 3,424.
// Guessing a number inside the warning about misread numbers is the joke that
// §6.5 keeps not being.)
//
// A count like that, printed bare next to an organism name, invites exactly
// the wrong reading — that this virus is 400× more important, more prevalent,
// or better understood mechanistically. It is a measure of sequencing effort,
// and §5.5 requires it to be labelled as one. That caveat is not decoration
// here; it is the main thing the panel has to say.
// ─────────────────────────────────────────────────────────────────────────

import { fetchJson, NoEntry, FetchMeta } from '../http';
import { TTL } from '../cache';
import type { Connector, Fact } from '../types';

const E = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[] };
}

function apiKeyParam(): string {
  const k = process.env.NCBI_API_KEY;
  return k ? `&api_key=${encodeURIComponent(k)}` : '';
}

/**
 * The [Organism] field qualifier MUST be percent-encoded. Measured 2026-11-06:
 * sending raw `[` and `]` returned a non-JSON body, which `fetchJson` correctly
 * reports as 'response was not JSON' — a confusing failure for what is really
 * a malformed URL.
 */
async function count(term: string, timeoutMs: number, meta: FetchMeta): Promise<number> {
  const result = await fetchJson<ESearchResponse>(
    `${E}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(term)}&retmode=json&retmax=1${apiKeyParam()}`,
    { timeoutMs, ttlMs: TTL.standard },
  );
  meta.record(result);
  const n = Number(result.json.esearchresult?.count);
  if (!Number.isFinite(n)) throw new NoEntry('NCBI returned no count');
  return n;
}

export const ncbivirus: Connector = {
  id: 'ncbivirus',
  name: 'Sequence availability',
  source: 'NCBI Nucleotide',
  sourceUrl: 'https://www.ncbi.nlm.nih.gov/labs/virus/',
  layer: 'pathogen',
  requires: [['taxid']],
  presets: ['antiviral'],
  timeoutMs: 15000,

  async run(ids) {
    const meta = new FetchMeta();
    if (!ids.taxid) throw new NoEntry('No NCBI taxid');
    const taxid = ids.taxid;
    const name = ids.organismName ?? `taxid ${taxid}`;

    const total = await count(`txid${taxid}[Organism]`, this.timeoutMs, meta);
    if (!total) {
      throw new NoEntry(`NCBI Nucleotide holds no sequence for ${name}`);
    }

    // Complete genomes are the subset usable for most comparative work, and
    // the ratio to the total is itself informative — a million partial reads
    // and a thousand complete genomes is a different resource from the reverse.
    const complete = await count(
      `txid${taxid}[Organism] AND "complete genome"[Title]`,
      this.timeoutMs,
      meta,
    );

    const facts: Fact[] = [
      {
        label: 'Nucleotide sequences',
        value: total.toLocaleString(),
        // No other organism's count is quoted here. The first draft of this
        // note said "Zika ~22k" from memory; the measured figure is 3,424 —
        // a made-up number inside the very caveat warning against misreading
        // numbers. §6.5's rule against literals applies to prose too.
        note:
          'A measure of SEQUENCING EFFORT, not of prevalence, severity or how well the ' +
          'organism is understood. Counts across organisms differ by three or four orders ' +
          'of magnitude largely according to how much surveillance sequencing was funded, ' +
          'and when. Do not read this number as a ranking.',
      },
    ];

    if (complete > 0) {
      const pct = (complete / total) * 100;
      facts.push({
        label: 'Titled "complete genome"',
        value: `${complete.toLocaleString()} (${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%)`,
        // This WILL disagree violently with the BV-BRC panel's "complete
        // genomes", and the researcher sees both at once. Influenza A measured
        // 2026-11-06: 56 here against 391,854 at BV-BRC, a ~7000× gap. Neither
        // is wrong — one greps a title string, the other reads a curated field,
        // and a segmented genome is deposited per segment and so is rarely
        // titled "complete genome" at all. An unexplained 7000× discrepancy on
        // one screen is worse than either number alone, so it is explained.
        note:
          'Matched on the sequence TITLE, a deposition convention rather than a validated ' +
          'field. It is not comparable with the BV-BRC panel\'s "complete genomes", which ' +
          'reads a curated status field — expect the two to differ by orders of magnitude. ' +
          'Segmented genomes such as influenza are deposited per segment and are seldom ' +
          'titled this way, so a low figure here can mean the naming convention differs, ' +
          'not that full-length sequences are missing.',
      });
    }

    facts.push({
      label: 'Scope of this panel',
      value: 'Organism context only',
      note:
        'Per the project scope this covers host-directed work: which organism, and what ' +
        'sequence data exists for it. Viral protein structures and direct-acting antiviral ' +
        'chemistry are deliberately out of scope — the gene panels above describe the ' +
        'HUMAN host factors, which is the question this toolkit can actually answer.',
    });

    return {
      state: 'data',
      facts,
      recordUrl: `https://www.ncbi.nlm.nih.gov/labs/virus/vssi/#/virus?SeqType_s=Nucleotide&VirusLineage_ss=taxid:${encodeURIComponent(taxid)}`,
      ...meta.get(),
    };
  },
};
