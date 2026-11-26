// Free text -> trait, PDB id -> proteins, ChEMBL id -> target or molecule.
// Kept together because each is a small identifier translation feeding the
// resolver, not a panel of its own.

import { fetchJson, NoEntry } from './http';
import { TTL } from './cache';

// ---------------------------------------------------------------- free text

const OPEN_TARGETS = 'https://api.platform.opentargets.org/api/v4/graphql';

interface OtSearchResponse {
  data?: {
    search?: {
      total?: number;
      hits?: { id?: string; name?: string; entity?: string; description?: string | null }[];
    };
  };
}

export interface TraitHit {
  efoId: string;
  name: string;
  description?: string;
}

/** Free text to an ontology term, so downstream panels have an id to query. */
export async function resolveTrait(text: string, timeoutMs = 10000): Promise<TraitHit> {
  const { json } = await fetchJson<OtSearchResponse>(OPEN_TARGETS, {
    timeoutMs,
    ttlMs: TTL.standard,
    method: 'POST',
    body: {
      query: `query Search($q: String!) {
        search(queryString: $q, entityNames: ["disease"], page: { index: 0, size: 5 }) {
          total
          hits { id name entity description }
        }
      }`,
      variables: { q: text },
    },
    cacheKey: `ot-search ${text.toLowerCase()}`,
  });

  const hit = json.data?.search?.hits?.find((h) => h.entity === 'disease' && h.id && h.name);
  if (!hit?.id || !hit.name) throw new NoEntry(`No disease or trait matches "${text}"`);

  return { efoId: hit.id, name: hit.name, description: hit.description ?? undefined };
}

interface OtDiseaseTargets {
  data?: {
    disease?: {
      associatedTargets?: {
        count?: number;
        rows?: { score?: number; target?: { approvedSymbol?: string } }[];
      };
    };
  };
}

export interface TraitTargets {
  /** Approved symbols, highest association score first. */
  genes: string[];
  /** How many Open Targets holds in total, which is far more than we show. */
  total: number;
}

/**
 * The genes a trait is associated with — the other direction of Open Targets.
 *
 * Criterion 4 is "neuropathic pain resolves to a trait WITH associated genes",
 * and until M7 it resolved to an EFO id and nothing else: a trait query
 * produced an identifier no panel could use, so the search returned a name and
 * no biology. Measured 2026-11-06: EFO_0005762 has 934 associated targets, led
 * by the calcium-channel subunits, so the data was there and simply unasked for.
 *
 * These symbols are what makes a trait search go anywhere: they are real
 * symbols from a real source, which is the only kind `suggest.ts` is allowed to
 * turn into a next query.
 *
 * Best-effort by design. A trait that resolves but whose targets fail to load
 * is still a resolved trait (§5.4), so callers treat this as enrichment.
 */
export async function traitTargets(efoId: string, timeoutMs = 15000, limit = 12): Promise<TraitTargets> {
  const { json } = await fetchJson<OtDiseaseTargets>(OPEN_TARGETS, {
    timeoutMs,
    ttlMs: TTL.long,
    method: 'POST',
    body: {
      query: `query Chaperone($id: String!, $size: Int!) {
        disease(efoId: $id) {
          associatedTargets(page: { index: 0, size: $size }) {
            count
            rows { score target { approvedSymbol } }
          }
        }
      }`,
      variables: { id: efoId, size: limit },
    },
    cacheKey: `ot-disease-targets ${efoId} ${limit}`,
  });

  const assoc = json.data?.disease?.associatedTargets;
  const genes = (assoc?.rows ?? [])
    .map((r) => r.target?.approvedSymbol)
    .filter((s): s is string => Boolean(s));

  if (!genes.length) throw new NoEntry(`Open Targets lists no associated targets for ${efoId}`);
  return { genes, total: assoc?.count ?? genes.length };
}

// ----------------------------------------------------------------- PDB entry

const RCSB_ENTRY = 'https://data.rcsb.org/rest/v1/core/entry';
const RCSB_ENTITY = 'https://data.rcsb.org/rest/v1/core/polymer_entity';

interface RcsbEntry {
  rcsb_entry_container_identifiers?: { polymer_entity_ids?: string[] };
  struct?: { title?: string };
}

interface RcsbEntity {
  rcsb_polymer_entity_container_identifiers?: { uniprot_ids?: string[] };
  rcsb_polymer_entity?: { pdbx_description?: string };
  entity_poly?: { rcsb_sample_sequence_length?: number; pdbx_seq_one_letter_code_can?: string };
}

export interface PdbHit {
  pdbId: string;
  title?: string;
  /**
   * One entry holds several proteins, ordered by entity number, which carries
   * no biological meaning: 6J8G lists the beta-2 subunit as entity 1 while the
   * protein the structure is about is the Nav1.7 alpha subunit.
   *
   * Sorted longest chain first. In a receptor-plus-accessory complex the long
   * chain is the subject and the short ones are the accessories, so this picks
   * the protein a researcher means far more often than entity order does. It
   * is a heuristic, not a rule — the alternatives stay in the list and the
   * resolver says which one it chose.
   */
  accessions: { accession: string; description?: string; length?: number }[];
}

export async function resolvePdb(pdbId: string, timeoutMs = 10000): Promise<PdbHit> {
  const id = pdbId.toUpperCase();
  const { json: entry } = await fetchJson<RcsbEntry>(`${RCSB_ENTRY}/${id}`, {
    timeoutMs,
    ttlMs: TTL.long,
    emptyOn: [404],
  });

  const entityIds = entry.rcsb_entry_container_identifiers?.polymer_entity_ids ?? [];
  if (!entityIds.length) throw new NoEntry(`PDB ${id} has no polymer entities`);

  const accessions: PdbHit['accessions'] = [];
  // Serial, not parallel: §5.3 forbids many concurrent requests to one provider.
  for (const entityId of entityIds.slice(0, 6)) {
    try {
      const { json: ent } = await fetchJson<RcsbEntity>(`${RCSB_ENTITY}/${id}/${entityId}`, {
        timeoutMs,
        ttlMs: TTL.long,
      });
      const length =
        ent.entity_poly?.rcsb_sample_sequence_length ?? ent.entity_poly?.pdbx_seq_one_letter_code_can?.length;
      for (const acc of ent.rcsb_polymer_entity_container_identifiers?.uniprot_ids ?? []) {
        accessions.push({ accession: acc, description: ent.rcsb_polymer_entity?.pdbx_description, length });
      }
    } catch {
      // A single unreadable entity should not sink the whole entry.
    }
  }

  accessions.sort((a, b) => (b.length ?? 0) - (a.length ?? 0));

  return { pdbId: id, title: entry.struct?.title, accessions };
}

// --------------------------------------------------------------- ChEMBL id

const CHEMBL = 'https://www.ebi.ac.uk/chembl/api/data';

interface ChemblTarget {
  pref_name?: string;
  target_type?: string;
  target_components?: {
    accession?: string;
    target_component_synonyms?: { syn_type?: string; component_synonym?: string }[];
  }[];
}

interface ChemblMolecule {
  molecule_chembl_id?: string;
  pref_name?: string;
  max_phase?: string;
  molecule_type?: string;
}

export interface ChemblHit {
  chemblId: string;
  kind: 'target' | 'molecule';
  name?: string;
  /** Populated for targets. A protein complex yields several. */
  components: { accession: string; symbol?: string }[];
  maxPhase?: string;
}

interface ChemblIdLookup {
  entity_type?: string;
  status?: string;
}

/**
 * A CHEMBL id can name a molecule, a target, an assay or a document, and the
 * id itself does not say which. Ask ChEMBL rather than guessing.
 *
 * The first design probed `/target/{id}` and fell back to `/molecule/{id}`.
 * Measured, that was both slow and wrong: ChEMBL takes 10.3s to return a 404
 * from the target endpoint, and when that probe timed out the fallback
 * concluded "not a target" and produced a wrong answer for an id that was in
 * fact a target. A guess that fails open is worse than a question.
 *
 * `chembl_id_lookup` answers definitively in one call. This change buys
 * correctness, not speed.
 *
 * ChEMBL is measurably the slowest source in the inventory and its latency is
 * highly variable: the same endpoint returned in 4.4s, 6.8s and over 12s
 * across runs. Hence the 20s budget, far above any other source. A ChEMBL id
 * is something the researcher typed deliberately, so waiting beats failing —
 * and the cache makes the second lookup instant.
 */
export async function resolveChembl(chemblId: string, timeoutMs = 20000): Promise<ChemblHit> {
  const id = chemblId.toUpperCase();

  const { json: lookup } = await fetchJson<ChemblIdLookup>(`${CHEMBL}/chembl_id_lookup/${id}.json`, {
    timeoutMs,
    ttlMs: TTL.long,
    emptyOn: [404],
  });

  const entity = lookup.entity_type?.toUpperCase();

  if (entity === 'TARGET') {
    const { json } = await fetchJson<ChemblTarget>(
      `${CHEMBL}/target/${id}.json?only=pref_name,target_type,target_components`,
      { timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
    );
    const components = (json.target_components ?? [])
      .map((c) => ({
        accession: c.accession ?? '',
        symbol: (c.target_component_synonyms ?? []).find((s) => s.syn_type === 'GENE_SYMBOL')?.component_synonym,
      }))
      .filter((c) => c.accession);
    return { chemblId: id, kind: 'target', name: json.pref_name, components };
  }

  if (entity === 'COMPOUND') {
    // `only=` matters: the full aspirin record is 11.5 KB and took 6.8s in
    // testing, against 113 bytes and 3.1s for the four fields we use.
    const { json } = await fetchJson<ChemblMolecule>(
      `${CHEMBL}/molecule/${id}.json?only=molecule_chembl_id,pref_name,max_phase,molecule_type`,
      { timeoutMs, ttlMs: TTL.long, emptyOn: [404] },
    );
    if (!json.molecule_chembl_id) throw new NoEntry(`ChEMBL has no molecule ${id}`);
    return { chemblId: id, kind: 'molecule', name: json.pref_name, components: [], maxPhase: json.max_phase };
  }

  throw new NoEntry(
    `${id} is a ChEMBL ${entity?.toLowerCase() ?? 'record'}, which Chaperone does not look up. Try a target or compound id.`,
  );
}
