// Input -> canonical identifiers. PROJECT-PLAN.md §6.5.
//
// UniProt is the spine: one ~1s call yields the accession, HGNC, NCBI GeneID
// and transcripts. GTEx supplies the Ensembl and versioned GENCODE ids, since
// Ensembl REST measured 12s and 503s during gate 1. dbSNP handles variants.
//
// Every identifier here is derived. None is written as a literal anywhere in
// this codebase — a wrong hardcoded HGNC id silently returned SCN8A for SCN9A
// during gate 1, and nothing errored.

import { detect } from './detect';
import { bySymbol, byAccession, byEnsembl, type UniProtRecord } from './uniprot-record';
import { lookupGene } from './gtex-gene';
import { resolveRsid } from './dbsnp';
import { resolveTrait, traitTargets, resolvePdb, resolveChembl } from './lookup-ids';
import { resolveOrganism } from './taxonomy';
import { NoEntry } from './http';
import type { Identifiers } from './types';

export interface ResolveResult {
  ids: Identifiers;
  explanation: string;
  /** Non-fatal notes: which route was taken, what was ambiguous, what is missing. */
  notes: string[];
}

function fromUniProt(query: string, kind: Identifiers['kind'], r: UniProtRecord): Identifiers {
  return {
    query,
    kind,
    symbol: r.symbol,
    proteinName: r.proteinName,
    uniprot: r.accession,
    hgnc: r.hgnc,
    ncbiGene: r.ncbiGene,
    transcripts: r.transcripts,
  };
}

/**
 * Add the Ensembl and GENCODE ids. Best-effort: GTEx having no record for a
 * gene must not fail a resolution that UniProt already answered. The panels
 * needing a gencodeId simply will not be offered (§5.4, requires in §registry).
 */
async function enrichWithGtex(ids: Identifiers, notes: string[]): Promise<void> {
  const lookupKey = ids.ensemblGene ?? ids.symbol;
  if (!lookupKey) return;
  try {
    const gene = await lookupGene(lookupKey);
    ids.ensemblGene = gene.ensemblGene;
    ids.gencodeId = gene.gencodeId;

    // Cross-source agreement check (§7.6). Two sources naming different genes
    // for one query is the exact failure this project exists to prevent.
    if (gene.symbol && ids.symbol && gene.symbol.toUpperCase() !== ids.symbol.toUpperCase()) {
      notes.push(`Source disagreement: UniProt says ${ids.symbol}, GTEx says ${gene.symbol}. Treat downstream values with suspicion.`);
    }
  } catch {
    notes.push('GTEx has no gene record, so expression panels will not be offered.');
  }
}

export async function resolve(raw: string): Promise<ResolveResult> {
  const d = detect(raw);
  const notes: string[] = [];

  switch (d.kind) {
    case 'symbol': {
      const r = await bySymbol(d.normalised).catch((e) => {
        if (e instanceof NoEntry) {
          throw new NoEntry(
            `"${d.normalised}" does not match a reviewed human gene in UniProt. Check the symbol, or try an accession (Q15858) or an rsID (rs1333049).`,
          );
        }
        throw e;
      });
      if (r.symbol && r.symbol.toUpperCase() !== d.normalised) {
        notes.push(`Interpreted "${d.normalised}" as ${r.symbol}`);
      }
      const ids = fromUniProt(raw, 'symbol', r);
      await enrichWithGtex(ids, notes);
      return { ids, explanation: d.explanation, notes };
    }

    case 'uniprot': {
      const r = await byAccession(d.normalised);
      const ids = fromUniProt(raw, 'uniprot', r);
      await enrichWithGtex(ids, notes);
      return { ids, explanation: d.explanation, notes };
    }

    case 'ensembl': {
      const r = await byEnsembl(d.normalised);
      const ids = fromUniProt(raw, 'ensembl', r);
      if (/^ENSG/i.test(d.normalised)) {
        ids.ensemblGene = (d.normalised.split('.')[0] ?? d.normalised).toUpperCase();
      }
      await enrichWithGtex(ids, notes);
      return { ids, explanation: d.explanation, notes };
    }

    case 'rsid': {
      const variant = await resolveRsid(d.normalised);
      const ids: Identifiers = { query: raw, kind: 'rsid', rsid: variant.rsid, variant };

      if (variant.genes.length) {
        notes.push(`Gene context from ${variant.geneSource}: ${variant.genes.join(', ')}`);
        if (variant.genes.length > 1) {
          notes.push('Variant maps to more than one gene; the first is used for gene-level panels.');
        }
        // Resolve the mapped gene so gene-level panels can run on a variant query.
        const symbol = variant.genes[0];
        if (symbol) {
          try {
            const r = await bySymbol(symbol);
            ids.symbol = r.symbol;
            ids.proteinName = r.proteinName;
            ids.uniprot = r.accession;
            ids.hgnc = r.hgnc;
            ids.ncbiGene = r.ncbiGene;
            ids.transcripts = r.transcripts;
            await enrichWithGtex(ids, notes);
          } catch {
            notes.push(`No reviewed UniProt entry for ${symbol}, so gene-level panels will not be offered.`);
          }
        }
      } else {
        notes.push('Intergenic or unmapped variant: no gene context in dbSNP or the GWAS Catalog, so only variant-level panels will run.');
      }

      return { ids, explanation: d.explanation, notes };
    }

    case 'text': {
      // Free text can name a trait ("neuropathic pain") or an organism
      // ("SARS-CoV-2"), and nothing about the string reliably says which.
      // Rather than guess, both are attempted and whatever answers is kept —
      // each independently, so one source having nothing never suppresses the
      // other. Measured: NCBI Taxonomy returns 0 for "neuropathic pain" and
      // Open Targets finds no trait for "SARS-CoV-2", so in practice the two
      // do not collide. When they do, both are reported (§5.5 — say that the
      // input was ambiguous rather than silently picking one).
      const ids: Identifiers = { query: raw, kind: 'text', text: d.normalised };

      const [trait, organism] = await Promise.allSettled([
        resolveTrait(d.normalised),
        resolveOrganism(d.normalised),
      ]);

      if (trait.status === 'fulfilled') {
        ids.efoId = trait.value.efoId;
        ids.traitName = trait.value.name;
        if (trait.value.name.toLowerCase() !== d.normalised.toLowerCase()) {
          notes.push(`Matched "${d.normalised}" to the trait ${trait.value.name}`);
        }

        // §7.4 wants a trait to resolve WITH its associated genes. Without
        // this a trait search ended at an identifier: no panel takes an EFO id,
        // so the query produced a name and no biology. Best-effort — a trait
        // whose targets fail to load is still a resolved trait (§5.4).
        try {
          const t = await traitTargets(trait.value.efoId);
          ids.traitGenes = t.genes;
          ids.traitGeneCount = t.total;
          notes.push(
            `Open Targets associates ${t.total.toLocaleString()} genes with ${trait.value.name}; ` +
              `the ${t.genes.length} strongest are ${t.genes.join(', ')}. ` +
              'Association scores aggregate several kinds of evidence and are not proof of causation.',
          );
        } catch {
          notes.push(
            `No associated genes could be loaded for ${trait.value.name}. The trait itself resolved, ` +
              'so this is a gap in the lookup rather than an absence of associations.',
          );
        }
      }

      if (organism.status === 'fulfilled') {
        const o = organism.value;
        ids.taxid = o.taxid;
        ids.organismName = o.name;
        ids.organismRank = o.rank;
        ids.organismDivision = o.division;
        notes.push(
          `Matched "${d.normalised}" to the organism ${o.name} (NCBI taxid ${o.taxid}` +
            `${o.rank ? `, rank: ${o.rank}` : ''}${o.division ? `, ${o.division}` : ''}).`,
        );
      }

      if (trait.status === 'rejected' && organism.status === 'rejected') {
        // Neither reading worked. Surface the trait failure, which is the more
        // common intent, rather than inventing a combined message.
        throw trait.reason;
      }

      if (trait.status === 'fulfilled' && organism.status === 'fulfilled') {
        notes.push(
          'This text matches both a trait and an organism. Panels for both are offered; ' +
            'check which one you meant.',
        );
      }

      return { ids, explanation: d.explanation, notes };
    }

    case 'pdb': {
      const hit = await resolvePdb(d.normalised);
      const ids: Identifiers = { query: raw, kind: 'pdb', pdbId: hit.pdbId };
      if (!hit.accessions.length) {
        notes.push('No UniProt cross-reference on this entry, so gene-level panels will not be offered.');
        return { ids, explanation: d.explanation, notes };
      }

      const [primary, ...rest] = hit.accessions;
      if (!primary) return { ids, explanation: d.explanation, notes };

      // §6.5: one entry, several proteins. Say which one was chosen.
      if (rest.length) {
        notes.push(
          `PDB ${hit.pdbId} contains ${hit.accessions.length} proteins. Using the longest chain, ${primary.accession}${primary.description ? ` (${primary.description}` : ''}${primary.length ? `, ${primary.length} aa)` : primary.description ? ')' : ''}; also present: ${rest.map((a) => a.accession).join(', ')}.`,
        );
        ids.alsoResolvesTo = rest.map((a) => ({ accession: a.accession }));
      }

      const r = await byAccession(primary.accession);
      Object.assign(ids, fromUniProt(raw, 'pdb', r), { pdbId: hit.pdbId, alsoResolvesTo: ids.alsoResolvesTo });
      await enrichWithGtex(ids, notes);
      return { ids, explanation: d.explanation, notes };
    }

    case 'chembl': {
      const hit = await resolveChembl(d.normalised);
      const ids: Identifiers = { query: raw, kind: 'chembl', chemblId: hit.chemblId };

      if (hit.kind === 'molecule') {
        notes.push(`${hit.chemblId} is a molecule${hit.name ? ` (${hit.name})` : ''}, not a target. Compound panels only.`);
        return { ids, explanation: d.explanation, notes };
      }

      const [primary, ...rest] = hit.components;
      if (!primary) {
        notes.push('Target has no protein components with a UniProt accession.');
        return { ids, explanation: d.explanation, notes };
      }
      if (rest.length) {
        notes.push(
          `${hit.chemblId}${hit.name ? ` (${hit.name})` : ''} is a complex of ${hit.components.length} proteins. Using ${primary.symbol ?? primary.accession}; also present: ${rest.map((c) => c.symbol ?? c.accession).join(', ')}.`,
        );
        ids.alsoResolvesTo = rest;
      }

      const r = await byAccession(primary.accession);
      Object.assign(ids, fromUniProt(raw, 'chembl', r), { chemblId: hit.chemblId, alsoResolvesTo: ids.alsoResolvesTo });
      await enrichWithGtex(ids, notes);
      return { ids, explanation: d.explanation, notes };
    }

    case 'coordinate':
      // Coordinates need no translation: the gnomAD connector (M3) queries
      // them directly. Resolving one to a gene would require a range lookup
      // we have no verified source for.
      notes.push('Coordinate queries run variant-level panels only.');
      return {
        ids: { query: raw, kind: 'coordinate', coordinate: d.normalised },
        explanation: d.explanation,
        notes,
      };

    default:
      throw new NoEntry(
        `Could not interpret "${raw}". Try a gene symbol (SCN9A), an rsID (rs1333049), a UniProt accession (Q15858), or a disease name.`,
      );
  }
}
