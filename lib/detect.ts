// What did the user type? PROJECT-PLAN.md §3 — one box, no mode switch.
// Classification only; resolution happens in lib/resolve.ts.

import type { InputKind } from './types';

/** UniProtKB accession, per UniProt's own published pattern. */
const UNIPROT = /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/;
const RSID = /^rs\d+$/i;
const ENSEMBL_GENE = /^ENSG\d{11}(\.\d+)?$/i;
const ENSEMBL_OTHER = /^ENS[TP]\d{11}(\.\d+)?$/i;
/** PDB entry ids start with a digit and are four alphanumerics. */
const PDB = /^[1-9][A-Za-z0-9]{3}$/;
const CHEMBL = /^CHEMBL\d+$/i;
/** chr2:166,195,000 · 2:166195000 · 2-166195000-A-G */
const COORDINATE = /^(chr)?([0-9]{1,2}|[XYM]|MT)[:\-][\d,]+([:\-][ACGT]+[:\-][ACGT]+)?$/i;
/**
 * Gene symbols: letters, digits, hyphens, and the lowercase "orf" infix
 * (C9orf72). Deliberately narrow — anything longer or containing a space
 * falls through to free text.
 */
const SYMBOL = /^[A-Z][A-Z0-9]{0,9}(orf\d{1,3})?(-[A-Z0-9]{1,6})?$/;

export interface Detection {
  kind: InputKind;
  /** The query normalised for that kind — e.g. symbols upper-cased. */
  normalised: string;
  /** Shown in the UI so the user can see how their input was read. */
  explanation: string;
}

export function detect(raw: string): Detection {
  const q = raw.trim();

  if (!q) return { kind: 'unknown', normalised: '', explanation: 'Empty query' };

  if (RSID.test(q)) {
    return { kind: 'rsid', normalised: q.toLowerCase(), explanation: 'dbSNP variant identifier' };
  }
  if (ENSEMBL_GENE.test(q)) {
    return { kind: 'ensembl', normalised: q.toUpperCase(), explanation: 'Ensembl gene identifier' };
  }
  if (ENSEMBL_OTHER.test(q)) {
    return { kind: 'ensembl', normalised: q.toUpperCase(), explanation: 'Ensembl transcript or protein identifier' };
  }
  if (CHEMBL.test(q)) {
    return { kind: 'chembl', normalised: q.toUpperCase(), explanation: 'ChEMBL identifier' };
  }
  // UniProt is tested before PDB and symbol: its pattern is the most specific.
  if (UNIPROT.test(q.toUpperCase())) {
    return { kind: 'uniprot', normalised: q.toUpperCase(), explanation: 'UniProtKB accession' };
  }
  if (COORDINATE.test(q)) {
    return { kind: 'coordinate', normalised: q.replace(/,/g, ''), explanation: 'Genomic coordinate' };
  }
  if (PDB.test(q)) {
    return { kind: 'pdb', normalised: q.toUpperCase(), explanation: 'PDB entry identifier' };
  }
  if (SYMBOL.test(q.toUpperCase()) && !q.includes(' ')) {
    return { kind: 'symbol', normalised: q.toUpperCase(), explanation: 'Gene symbol' };
  }
  return { kind: 'text', normalised: q, explanation: 'Free text — searched as a disease, trait or organism' };
}
