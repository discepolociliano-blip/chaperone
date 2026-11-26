'use client';

// What the query turned out to be, before any panel has loaded.
//
// This block is the answer to §7.1: the researcher typed one thing and should
// see every identifier derived from it, without having chosen a database or an
// id type. It is also where ambiguity is surfaced rather than resolved
// silently (§5.5) — a PDB entry with several chains, a ChEMBL complex, and the
// free text that matches both a disease and an organism.
//
// The frozen M1 page could not render the organism half at all: M5 added
// `taxid` and `organismName` and the page predated them, which is the concrete
// cost §14.2 recorded. It is rendered here.

import type { Identifiers } from '@/lib/types';

export interface ResolvedIdentityProps {
  ids: Identifiers;
  explanation: string;
  notes: string[];
  /** True once panels are known to be none, so the message is not shown early. */
  noPanels: boolean;
}

export function ResolvedIdentity({ ids, explanation, notes, noPanels }: ResolvedIdentityProps) {
  const heading = ids.symbol ?? ids.traitName ?? ids.organismName ?? ids.chemblId ?? ids.query;
  const subtitle = ids.proteinName ?? undefined;

  return (
    <div className="resolved">
      <div className="kind">{explanation}</div>
      <div className="symbol">
        {heading}
        {subtitle && <span className="protein"> — {subtitle}</span>}
      </div>

      <div className="ids">
        {ids.uniprot && <code>UniProt {ids.uniprot}</code>}
        {ids.hgnc && <code>{ids.hgnc}</code>}
        {ids.ncbiGene && <code>NCBI Gene {ids.ncbiGene}</code>}
        {ids.ensemblGene && <code>{ids.ensemblGene}</code>}
        {ids.gencodeId && ids.gencodeId !== ids.ensemblGene && <code>GENCODE {ids.gencodeId}</code>}
        {ids.rsid && <code>{ids.rsid}</code>}
        {ids.coordinate && <code>{ids.coordinate}</code>}
        {ids.pdbId && <code>PDB {ids.pdbId}</code>}
        {ids.chemblId && <code>{ids.chemblId}</code>}
        {ids.efoId && <code>{ids.efoId}</code>}
        {ids.taxid && <code>NCBI taxid {ids.taxid}</code>}
      </div>

      {/* M5: an organism is a different kind of subject from a human gene, and
          §11.6 scopes its panels to identification and context. Saying which
          organism, and its NCBI division, is what makes that scope legible. */}
      {ids.taxid && (
        <div className="identity-row">
          <span className="identity-key">Organism</span>
          <span>
            {ids.organismName ?? `taxid ${ids.taxid}`}
            {ids.organismRank && <span className="dim"> · rank: {ids.organismRank}</span>}
            {ids.organismDivision && <span className="dim"> · {ids.organismDivision}</span>}
          </span>
        </div>
      )}

      {/* §7.4: a trait resolves WITH its associated genes. Before M7 this row
          did not exist, because a trait resolved to an id and nothing else. */}
      {ids.traitGenes?.length ? (
        <div className="identity-row">
          <span className="identity-key">Associated genes</span>
          <span>
            {ids.traitGenes.join(' · ')}
            {ids.traitGeneCount && ids.traitGeneCount > ids.traitGenes.length ? (
              <span className="dim">
                {' '}
                — the {ids.traitGenes.length} strongest of {ids.traitGeneCount.toLocaleString()} in Open Targets.
                Association ranks strength of evidence, not causation.
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      {ids.variant && (
        <div className="identity-row">
          <span className="identity-key">Variant</span>
          <span>
            {ids.variant.alleles ?? ids.variant.rsid}
            {ids.variant.chrpos && <span className="dim"> · {ids.variant.chrpos}</span>}
            {ids.variant.majorStudyMaf && <span className="dim"> · MAF {ids.variant.majorStudyMaf}</span>}
            {ids.variant.genes.length ? (
              <span className="dim">
                {' '}
                · maps to {ids.variant.genes.join(', ')}
                {ids.variant.geneSource ? ` (via ${ids.variant.geneSource})` : ''}
              </span>
            ) : null}
          </span>
        </div>
      )}

      {/* One input, several proteins. Saying so beats picking one quietly. */}
      {ids.alsoResolvesTo?.length ? (
        <div className="identity-row">
          <span className="identity-key">Also present</span>
          <span className="dim">
            {ids.alsoResolvesTo.map((a) => a.symbol ?? a.accession).join(' · ')} — the primary subject above was
            chosen automatically.
          </span>
        </div>
      ) : null}

      {notes.map((n) => (
        <div className="note" key={n}>
          {n}
        </div>
      ))}

      {noPanels && (
        <div className="note">
          No panel can run on these identifiers. That is a limit of what Chaperone can query for this kind of
          subject, not a statement that the sources have nothing — the deep links below still apply.
        </div>
      )}
    </div>
  );
}
