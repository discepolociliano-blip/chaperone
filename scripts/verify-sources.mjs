// Gate 1: verify every endpoint in PROJECT-PLAN.md section 6 against the live API.
// Read-only. One request per source. No app code.

const UA = `Chaperone/0.1 (research lookup aggregator; contact: ${process.env.CHAPERONE_CONTACT_URL || 'TBD'})`;
const TIMEOUT_MS = 30000; // GWAS Catalog measured up to 17s (M4)

// Test subject: SCN9A — chosen because it spans all three domains
// (Nav1.7, pain genetics, congenital insensitivity to pain).
const SYMBOL = 'SCN9A';
const ENSG = 'ENSG00000169432';
const UNIPROT = 'Q15858';
// Corrected 2026-11-05. This constant read HGNC:10596 — the very transposition
// §6.5 was written about, left sitting inside the instrument meant to catch it.
// 10596 is SCN8A; SCN9A is 10597. Monarch answers either without complaint.
const HGNC = 'HGNC:10597';
const RSID = 'rs6746030';
// A symbol no organism uses, for the negative controls below.
const NONSENSE = 'ZZZZQQQQ';

// Pinned GTEx pairing — see lib/gtex-dataset.ts.
const GTEX_DATASET = 'gtex_v10';
const GTEX_GENCODE_VERSION = 'v39';

/** @type {{id:string,name:string,url:string,init?:RequestInit,expect:(j:any,text:string)=>string|null}[]} */
const SOURCES = [
  {
    id: 'uniprot',
    name: 'UniProt',
    url: `https://rest.uniprot.org/uniprotkb/search?query=gene:${SYMBOL}+AND+organism_id:9606+AND+reviewed:true&format=json&size=1`,
    expect: (j) => j?.results?.[0]?.primaryAccession ? `acc=${j.results[0].primaryAccession}` : null,
  },
  {
    id: 'ensembl',
    name: 'Ensembl REST',
    url: `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${SYMBOL}?expand=0`,
    init: { headers: { accept: 'application/json' } },
    expect: (j) => j?.id ? `id=${j.id} ${j.seq_region_name}:${j.start}` : null,
  },
  {
    id: 'ensembl-xref',
    name: 'Ensembl xrefs (resolver)',
    url: `https://rest.ensembl.org/xrefs/symbol/homo_sapiens/${SYMBOL}`,
    init: { headers: { accept: 'application/json' } },
    expect: (j) => Array.isArray(j) && j.length ? `${j.length} xrefs` : null,
  },
  {
    id: 'ensembl-variation',
    name: 'Ensembl variation (rsID)',
    url: `https://rest.ensembl.org/variation/human/${RSID}`,
    init: { headers: { accept: 'application/json' } },
    expect: (j) => j?.name ? `${j.name} MAF=${j.MAF ?? 'n/a'}` : null,
  },
  {
    id: 'gnomad',
    name: 'gnomAD (GraphQL)',
    url: 'https://gnomad.broadinstitute.org/api',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `{ gene(gene_symbol: "${SYMBOL}", reference_genome: GRCh38) {
          gene_id symbol
          gnomad_constraint { pLI oe_lof oe_lof_upper mis_z }
        } }`,
      }),
    },
    expect: (j) => {
      const c = j?.data?.gene?.gnomad_constraint;
      return c ? `pLI=${c.pLI} LOEUF=${c.oe_lof_upper}` : (j?.errors ? null : 'gene found, no constraint');
    },
  },
  {
    id: 'gtex-gene',
    name: 'GTEx v2 reference/gene',
    url: `https://gtexportal.org/api/v2/reference/gene?geneId=${SYMBOL}`,
    expect: (j) => j?.data?.[0]?.gencodeId ? `gencodeId=${j.data[0].gencodeId}` : null,
  },
  {
    id: 'gtex-expr',
    name: 'GTEx v2 medianGeneExpression',
    url: `https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=${ENSG}.14&datasetId=gtex_v8`,
    expect: (j) => j?.data?.length ? `${j.data.length} tissues` : null,
  },
  {
    id: 'reactome',
    name: 'Reactome ContentService',
    url: `https://reactome.org/ContentService/data/mapping/UniProt/${UNIPROT}/pathways?species=9606`,
    init: { headers: { accept: 'application/json' } },
    expect: (j) => Array.isArray(j) && j.length ? `${j.length} pathways, e.g. ${j[0].displayName}` : null,
  },
  {
    id: 'rcsb-search',
    name: 'RCSB PDB search',
    url: 'https://search.rcsb.org/rcsbsearch/v2/query',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: {
          type: 'terminal',
          service: 'text',
          parameters: {
            attribute: 'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession',
            operator: 'exact_match',
            value: UNIPROT,
          },
        },
        return_type: 'entry',
        request_options: { paginate: { start: 0, rows: 5 } },
      }),
    },
    expect: (j) => j?.total_count ? `${j.total_count} structures, e.g. ${j.result_set?.[0]?.identifier}` : null,
  },
  {
    id: 'alphafold',
    name: 'AlphaFold DB',
    url: `https://alphafold.ebi.ac.uk/api/prediction/${UNIPROT}`,
    expect: (j) => j?.[0]?.entryId ? `${j[0].entryId} len=${j[0].uniprotSequence?.length}` : null,
  },
  {
    id: 'chembl',
    name: 'ChEMBL target search',
    url: `https://www.ebi.ac.uk/chembl/api/data/target/search?q=${SYMBOL}&format=json&limit=3`,
    expect: (j) => j?.targets?.length ? `${j.targets.length} targets, e.g. ${j.targets[0].target_chembl_id}` : null,
  },
  {
    id: 'pubchem',
    name: 'PubChem PUG REST',
    url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/lidocaine/property/MolecularFormula,CanonicalSMILES/JSON',
    expect: (j) => j?.PropertyTable?.Properties?.[0]?.MolecularFormula ? `CID ${j.PropertyTable.Properties[0].CID}` : null,
  },
  {
    id: 'opentargets',
    name: 'Open Targets (GraphQL)',
    url: 'https://api.platform.opentargets.org/api/v4/graphql',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `{ target(ensemblId: "${ENSG}") {
          approvedSymbol biotype
          associatedDiseases(page:{index:0,size:3}) { count rows { disease { name } score } }
        } }`,
      }),
    },
    expect: (j) => {
      const t = j?.data?.target;
      return t?.approvedSymbol ? `${t.approvedSymbol}, ${t.associatedDiseases?.count} diseases` : null;
    },
  },
  {
    id: 'string',
    name: 'STRING network',
    url: `https://string-db.org/api/json/network?identifiers=${SYMBOL}&species=9606&limit=5&caller_identity=chaperone`,
    expect: (j) => Array.isArray(j) && j.length ? `${j.length} edges` : null,
  },
  {
    // M4: the documented `gene_name` is silently ignored and returns the whole
    // catalogue with a 200. `mapped_gene` is the parameter that filters. The
    // control is what makes this check meaningful rather than decorative.
    id: 'gwascat-gene',
    name: 'GWAS Catalog (by mapped_gene)',
    url: `https://www.ebi.ac.uk/gwas/rest/api/v2/associations?mapped_gene=${SYMBOL}&size=5`,
    control: `https://www.ebi.ac.uk/gwas/rest/api/v2/associations?mapped_gene=${NONSENSE}&size=5`,
    count: (j) => j?.page?.totalElements ?? j?._embedded?.associations?.length ?? 0,
    expect: (j) => {
      const total = j?.page?.totalElements;
      const rows = j?._embedded?.associations ?? [];
      if (total == null) return null;
      // Every row must actually name our gene, or the filter is not filtering.
      const ours = rows.filter((a) =>
        (a?.mapped_genes ?? []).some((g) => String(g).toUpperCase() === SYMBOL),
      ).length;
      if (rows.length && !ours) return null;
      return `${total} associations, ${ours}/${rows.length} rows name ${SYMBOL}`;
    },
  },
  {
    id: 'gwascat-snp',
    name: 'GWAS Catalog (by rsID, path-addressed)',
    // rs1333049 rather than RSID: rs6746030 has no catalogued association and
    // correctly 404s, which is the resolver's documented fallback case (§6.5).
    url: 'https://www.ebi.ac.uk/gwas/rest/api/v2/single-nucleotide-polymorphisms/rs1333049',
    expect: (j) => (j && typeof j === 'object' ? 'record returned' : null),
  },
  {
    id: 'monarch',
    name: 'Monarch Initiative v3',
    url: `https://api-v3.monarchinitiative.org/v3/api/entity/${HGNC}`,
    // Asserts the SYMBOL, not merely that a record came back: passing the wrong
    // HGNC id returns a different gene with a cheerful 200.
    expect: (j) =>
      j?.id && (j.symbol ?? j.name) === SYMBOL
        ? `${j.id} = ${j.symbol ?? j.name}`
        : null,
  },
  {
    id: 'gtex-expression',
    name: 'GTEx median expression (pinned pairing)',
    // M4: without BOTH params the two endpoints use different GENCODE releases
    // and this returns 200 with an empty array.
    url:
      `https://gtexportal.org/api/v2/expression/medianGeneExpression` +
      `?gencodeId=${ENSG}.19&datasetId=${GTEX_DATASET}&itemsPerPage=250`,
    expect: (j) => {
      const rows = j?.data ?? [];
      if (!rows.length) return null;
      const wrong = rows.find((r) => r?.datasetId && r.datasetId !== GTEX_DATASET);
      if (wrong) return null;
      return `${rows.length} tissues in ${GTEX_DATASET}`;
    },
  },
  {
    id: 'gtex-gene-pinned',
    name: `GTEx reference/gene (gencodeVersion=${GTEX_GENCODE_VERSION})`,
    url: `https://gtexportal.org/api/v2/reference/gene?geneId=${SYMBOL}&gencodeVersion=${GTEX_GENCODE_VERSION}`,
    expect: (j) => {
      const g = j?.data?.[0];
      if (!g?.gencodeId || g.geneSymbol !== SYMBOL) return null;
      return `${g.geneSymbol} = ${g.gencodeId}`;
    },
  },
  {
    id: 'hpo',
    name: 'HPO (ontology.jax.org)',
    url: `https://ontology.jax.org/api/network/search/gene?q=${SYMBOL}&limit=3`,
    expect: (j) => (j?.results?.length ?? j?.genes?.length) ? 'results returned' : null,
  },
  {
    id: 'intact',
    name: 'IntAct web service',
    url: `https://www.ebi.ac.uk/intact/ws/interaction/findInteractions/${SYMBOL}?page=0&pageSize=5`,
    expect: (j) => j?.totalElements != null ? `${j.totalElements} interactions` : null,
  },
  {
    id: 'gxa',
    name: 'EBI Expression Atlas',
    url: `https://www.ebi.ac.uk/gxa/json/search?geneQuery=[{"value":"${SYMBOL}"}]&species=homo%20sapiens`,
    expect: (j) => j?.results || j?.profiles ? 'results returned' : null,
  },
  {
    id: 'wikipathways-old',
    name: 'WikiPathways (legacy webservice)',
    url: `https://webservice.wikipathways.org/findPathwaysByText?query=${SYMBOL}&format=json`,
    expect: (j) => j?.result?.length ? `${j.result.length} pathways` : null,
  },
  {
    id: 'wikipathways-new',
    name: 'WikiPathways (data.wikipathways.org)',
    url: `https://www.wikipathways.org/json/findPathwaysByText.json?query=${SYMBOL}`,
    expect: (j) => j ? 'response parsed' : null,
  },
  {
    id: 'pharmgkb',
    name: 'PharmGKB',
    url: `https://api.pharmgkb.org/v1/data/gene?symbol=${SYMBOL}&view=max`,
    expect: (j) => j?.data?.length ? `${j.data[0].id} ${j.data[0].symbol}` : null,
  },
  {
    id: 'hpa',
    name: 'Human Protein Atlas',
    url: `https://www.proteinatlas.org/${ENSG}.json`,
    expect: (j) => j?.Gene ? `${j.Gene}` : (j ? 'json parsed' : null),
  },
  {
    id: 'bvbrc',
    name: 'BV-BRC',
    url: 'https://www.bv-brc.org/api/genome/?eq(genome_name,*Severe%20acute%20respiratory*)&limit(2)&http_accept=application/json',
    expect: (j) => Array.isArray(j) && j.length ? `${j.length} genomes` : null,
  },
  {
    id: 'clinvar',
    name: 'NCBI E-utilities (ClinVar)',
    url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${SYMBOL}[gene]&retmode=json&retmax=3`,
    expect: (j) => j?.esearchresult?.count ? `${j.esearchresult.count} records` : null,
  },
  {
    id: 'ncbi-virus',
    name: 'NCBI nuccore (virus seqs)',
    url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nuccore&term=txid2697049[Organism]&retmode=json&retmax=2',
    expect: (j) => j?.esearchresult?.count ? `${j.esearchresult.count} sequences` : null,
  },
];

async function check(s) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(s.url, {
      ...s.init,
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/json', ...(s.init?.headers || {}) },
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }

    if (!res.ok) {
      return { ...s, ok: false, ms, status: res.status, note: `HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, ' ')}` };
    }
    if (json === null) {
      return { ...s, ok: false, ms, status: res.status, note: `non-JSON response (${text.slice(0, 80).replace(/\s+/g, ' ')})` };
    }
    const detail = s.expect(json, text);
    if (detail === null) {
      return { ...s, ok: false, ms, status: res.status, note: `200 but expected field missing: ${JSON.stringify(json).slice(0, 140)}` };
    }

    // Negative control. A check that only asks "did something come back?"
    // cannot detect a filter that ignores its input — the GWAS Catalog returned
    // all 1.2M associations for every gene name we gave it, and for nonsense,
    // and for no filter at all, always with a 200 (M4 finding 2). WikiPathways
    // failed the same way (§6.3). So where an endpoint filters, we also ask it
    // for something that cannot exist and require a different, smaller answer.
    if (s.control && s.count) {
      // Its own clock. Sharing the main request's budget made a slow-but-
      // healthy source (GWAS Catalog, up to 17s) fail as a timeout once the
      // control was added — the check would have been reporting on itself.
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, 350));
      const cctrl = new AbortController();
      const ctimer = setTimeout(() => cctrl.abort(), TIMEOUT_MS);
      let cjson = null;
      try {
        const cres = await fetch(s.control, {
          ...s.init,
          signal: cctrl.signal,
          headers: { 'user-agent': UA, accept: 'application/json', ...(s.init?.headers || {}) },
        });
        cjson = await cres.json().catch(() => null);
      } catch {
        cjson = null;
      } finally {
        clearTimeout(ctimer);
      }
      const real = s.count(json);
      const control = cjson === null ? null : s.count(cjson);
      if (control === null) {
        return { ...s, ok: false, ms, status: res.status, note: `${detail} — control request unreadable` };
      }
      if (control >= real) {
        return {
          ...s,
          ok: false,
          ms,
          status: res.status,
          note: `FILTER IGNORED: "${NONSENSE}" returned ${control} and the real query ${real}. The parameter is not filtering.`,
        };
      }
      return { ...s, ok: true, ms, status: res.status, note: `${detail} · control(${NONSENSE})=${control}` };
    }

    return { ...s, ok: true, ms, status: res.status, note: detail };
  } catch (e) {
    return { ...s, ok: false, ms: Date.now() - t0, status: 0, note: e.name === 'AbortError' ? `timeout >${TIMEOUT_MS}ms` : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const s of SOURCES) {
  const r = await check(s);
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ms).padStart(5)}ms  ${r.id.padEnd(20)} ${r.note}`);
  await new Promise((r) => setTimeout(r, 350)); // be polite: serialise, ~3/s max
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n=== ${pass}/${results.length} passed ===\n`);
console.log('FAILURES:');
for (const r of results.filter((r) => !r.ok)) console.log(`  ${r.id}: ${r.note}`);
