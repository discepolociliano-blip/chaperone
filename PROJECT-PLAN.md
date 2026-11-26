# Chaperone — Project Plan

> **Status:** Gates 1–3 COMPLETE · **Gate 4 (execute) — M1–M8 done, plus two post-M8 additions you asked for (§11.8 the filter catalogue, §11.9 the structure door). M9 next: final verification and deploy.**
> **§7 criteria: all 20 met.** 16 are machine-checked every run by `npm run verify:criteria`, and **10b** by `npm run verify:absence` (a scripted local source — see §11.7a). The other three are induced by hand because no script can stage them: **8** and **8b** (partial failure) and **14** (needs a production build). All three were induced on 2026-11-09; see the M8 findings.
> **§11.7's correctness half is closed (§11.7a, 2026-11-10):** an absence is confirmed by a second request before it is reported, so a throttled 404 can no longer be printed as "this source has no record". The capacity half — outbound throttling, a shared cache — stays open for deploy.
> **Interface live:** 11 components + 1 hook, in four tabs — results, the filter catalogue, the structure door, and the database inventory (§11.10, added 2026-11-26). Everything at once · four panel states · presets and filters narrow, never reorder · every suggestion names its rule.
> **Two inputs on the page now, not one** — the search box and a file input, both allowlisted with a reason in criterion 15. §7.15 was re-argued rather than assumed when the second one landed; see §11.9.
> **Rules layer live:** 3 presets · 20 deep links · 10 suggestion rules. `npm run probe` and `npm run verify:deeplinks` both green.
> **Panels live:** 18, in the researcher's funnel (§11.2a, set 2026-11-09) — **condition:** Open Targets, ClinVar, HPO, Monarch · **target/pathway/biomarker:** UniProt, Reactome, STRING, IntAct, GTEx, HPA · **drug:** ChEMBL · **mechanism & safety:** PDB, AlphaFold, gnomAD · **study & population:** GWAS Catalog, dbSNP · **pathogen:** NCBI Nucleotide, BV-BRC
> **All data sources are now built.** M6 onward is rules and interface — no new connectors.
> **Under version control since 2026-11-26** — §10.7 closed. Public repo: <https://github.com/discepolociliano-blip/chaperone>
> **Last updated:** 2026-11-26 — **deployed and public:** <https://chaperone-cyan.vercel.app>
> **Owner:** you
> **This document is the source of truth.** If something is not written here, it is not agreed. Edit this file directly; I will read your edits before acting.

---

## How to use this document

- Read sections 1–4 first. They are the agreement.
- Anything you disagree with, edit in place or write `>> QUESTION:` beside it.
- Section 10 records decisions you have made. Two items are still open.
- Section 11 is the open-questions list, and §11.8 / §11.9 describe the two surfaces added after M8 — the filter catalogue and the structure door.
- **Not yet verified by you:** both post-M8 additions. The machine checks pass and the parser is probed against real files; your own look at them is still outstanding.
- Section 6 is now filled in with **tested** results, not my recollection.
- I will not write application code until section 12 is signed off.

---

## 1. Problem statement

A researcher working across three areas — broad-spectrum antivirals, psychiatric/neuro genetics, and pain genetics — currently has to visit 15–25 separate websites to answer one question about one gene. Each site has its own search box, its own navigation model, its own identifier conventions. Most of the time is spent clicking through category hierarchies, not thinking.

Almost all of these resources expose a **free HTTP API**. The information is not locked away; it is just scattered.

**Chaperone is a single query surface over those APIs.** One input box. One dashboard. No clicking between sites.

The name fits the job: a molecular chaperone does not change the protein, it helps it reach the right conformation. Chaperone does not change the data, it helps the researcher reach the right record.

## 2. What success looks like

A researcher types `SCN9A` and, within a few seconds, sees on one page:

- what the protein is and where it sits in the cell
- how intolerant the gene is to loss of function
- which clinical variants have been reported, and their significance
- which tissues and cell types express it
- which pathways it belongs to and what it interacts with
- whether a solved structure exists
- which compounds are known to hit it
- which diseases and GWAS traits it is associated with

…with every number carrying a link back to the source record it came from.

They type `rs1333049` and get the variant-centric equivalent. They type `neuropathic pain` and get the trait-centric equivalent.

## 3. Scope

### In scope (v1)

| | |
|---|---|
| **Input** | One box. Auto-detects gene symbol, rsID, Ensembl ID, UniProt accession, PDB ID, ChEMBL ID, genomic coordinate, or free-text disease/trait/pathogen. |
| **Output** | A dashboard of independent panels, one per data source, grouped by biological layer. |
| **Sources** | Every resource **verified** in section 6.1. Resources without a usable API appear as pre-filled deep links, not dead ends. |
| **Domains** | Presets that reorder and filter panels for antiviral, psychiatric/neuro, and pain work. |
| **Prediction** | After a lookup, suggest the next useful query based on what came back (section 8). |
| **Hosting** | **Local first.** Public deployment later; see 10.4 and the Vercel note in 10.1. |

### Out of scope (v1) — explicitly

- **No credential handling, ever.** See 3.1 — this is a hard rule, not a preference.
- No user accounts, no saved sessions, no server-side database of user data.
- No controlled-access data fetched by Chaperone. Nothing requiring an institutional agreement (UK Biobank individual data, dbGaP, All of Us, iPSYCH, MVP) is queried.
- No patient data, no PHI, ever. This is a research lookup tool, not a clinical decision tool.
- No re-hosting or redistribution of bulk datasets. We query live and cache briefly.
- No licence-restricted sources (section 6.3) — now a firmer line because the project is commercial.
- No AI-generated biological interpretation presented as fact. Suggestions are navigational, not inferential.

### 3.1 The credential rule

Per your decision in 10.4: for databases that require a login, **Chaperone sends the researcher to that database's own site to authenticate there.**

Chaperone will never:

- render a login form for a third-party database
- accept, store, forward, proxy or log a username, password, token or API key belonging to a user
- hold a session on a user's behalf against any external resource

The only credentials that exist anywhere in this system are **operator-held API keys** in server-side environment variables (section 5.2), which belong to the deployment, not to any user. A deep link that opens dbGaP or the UK Biobank AMS in a new tab is the whole of our involvement.

This rule exists because the alternative — a middleman holding researchers' institutional credentials for controlled-access genomic resources — would be both a serious security liability and a breach of those resources' own data use agreements.

### Deferred (v2 candidates, not now)

Saved gene lists · batch/CSV upload · export to PDF or spreadsheet · side-by-side gene comparison · orthologue view · a shareable permalink per query · revisiting PharmGKB, Expression Atlas and WikiPathways (section 6.3).

## 4. Working method — the five gates

**explore → plan → approve → execute → verify.** Each gate has an exit condition.

| Gate | What happens | Exit condition | Status |
|---|---|---|---|
| **1. Explore** | Call each API with a real query. Record endpoint, latency, response shape. | Section 6 filled in, every row `verified` or `dropped`. | ✅ **done 2026-11-04** |
| **2. Plan** | This document. Architecture, file layout, conventions, acceptance criteria. | You have read it and raised your questions. | ✅ **done** |
| **3. Approve** | You sign off section 12. | Your explicit yes. | ✅ **2026-11-04** |
| **4. Execute** | Code, in the order of section 14. One milestone at a time. | Milestone runs locally with live data. | 🔵 **M1 done** |
| **5. Verify** | Run section 7 against live APIs, not mocks. Report failures honestly. | Checklist complete, failures written down. | ⬜ |

**Rules for the gates**

- I do not skip ahead. No code during gate 2, no new scope during gate 4.
- If something in gate 4 contradicts the plan, I stop and amend this document rather than improvising.
- A failed verification is reported as failed. Not "working with minor issues".

## 5. Housekeeping — to be adhered to throughout

### 5.1 Repository hygiene

- Project lives in its own folder with its own git repository. Initialise before the first code commit.
- `main` stays deployable. Work on short-lived branches: `feat/…`, `fix/…`, `docs/…`.
- Commits small, describing intent. "Add Reactome connector with pathway dedup", not "update files".
- `.gitignore` covers `node_modules`, `.next`, `.env*.local`, `.DS_Store` from the first commit.
- No commits and no pushes without you asking for them.

### 5.2 Secrets and configuration

- No API key is ever hard-coded. All keys read from environment variables.
- `.env.example` committed with blank values and a comment per key. `.env.local` never committed.
- Every key-requiring source is **optional**: the app works without it and that panel degrades to a deep link naming the variable to set. (Your decision 10.6: keyless path first, gates left in place.)
- Keys live server-side only, never sent to the browser. This is the main reason the app has a server layer.
- Operator keys only. See 3.1 — no user credential ever enters this system.

### 5.3 API etiquette — non-negotiable

These are public, mostly publicly funded services, and we are a commercial user of them. We do not abuse them.

- **Identify ourselves.** Every outbound request sends `User-Agent: Chaperone/<version> (+<repo URL>)`. STRING requires a `caller_identity` parameter; it is sent.
- **Respect documented rates.** NCBI E-utilities: 3/s keyless, 10/s with key. PubChem: 5/s, 400/min. Where no number is published, stay conservative and serialise.
- **Cache.** Every response cached server-side. Identical lookups inside the TTL do not hit upstream. Default TTL 1 hour; stable reference data longer.
- **Fan out, but bounded.** One request per panel in parallel, each to a *different* provider. Never many concurrent requests to one provider.
- **Time out and give up.** Per-source timeout. **Ensembl gets 3 s and is never on the critical path** (see 6.5).
- **Never retry in a loop.** One retry on a network error, then an error state.
- **Attribute.** Every panel names its source and links to the record.

### 5.4 Failure philosophy

- **Panels fail independently.** One dead API shows one error card. It never blanks the page.
- **Four distinct states**, which look different in the UI because they mean different things:
  1. **data** — the source returned a record
  2. **no entry** — the source works and genuinely has nothing for this gene
  3. **unavailable** — network error, 5xx, or timeout
  4. **not configured** — an optional key is missing

  Gate 1 proved why this matters: the GWAS Catalog returns `HTTP 404 "snp with rs_id rs6746030 not found"` for a real rsID that simply has no catalogued association. That is state 2, not state 3. Showing it as an error would mislead a researcher into thinking the lookup failed.
- **Never fabricate a value to fill a panel.** Empty is empty.
- **Never present a cached value as live** without showing when it was fetched.

### 5.5 Scientific integrity

- Every figure on screen carries a link to the source record that produced it.
- Every panel shows the source name and, where available, the data release or version.
- Where numbers are derived (a count, a mean, a filtered subset), say so rather than implying it came straight from the source.
- Where a source is known to be incomplete or contested, say so in the panel's help text. Constraint metrics and variant pathogenicity calls especially.
- The footer states plainly that Chaperone is a navigational aid over third-party databases, not a clinical or diagnostic tool.

### 5.6 Licence compliance

**Chaperone is a commercial project (10.1).** This is now a filter, not a footnote.

- Licence checked and recorded before a connector is written. Section 6 has the column.
- Sources whose terms forbid commercial use are excluded, not flagged-and-included.
- Share-alike sources (ChEMBL, HPA, both CC BY-SA) are fine for display-with-attribution; we do not redistribute their data in bulk, which is what share-alike would otherwise bite on.
- **Before public launch**, each `verified` source's terms get a second read, because "free API" and "free for commercial use" are not the same claim. Logged as a gate-5 item.

**The second read happened in M7, on 2026-11-06.** No source turned out to forbid commercial
use, so nothing had to be dropped. But two recorded licences were wrong and two sources impose
obligations Chaperone was breaching:

| Source | Finding |
|---|---|
| **Human Protein Atlas** | Recorded as CC BY-SA 3.0; it is **CC BY 4.0**, and the terms explicitly encourage commercial use. Caveat: HPA embeds third-party data under its own constraints (AlphaFold 3 content there is CC BY-NC-SA 4.0). We read HPA's own expression fields only. |
| **Reactome** | Recorded as CC BY 4.0; the **data is CC0**. CC BY 4.0 covers their illustrations, icons and branding, which we do not use. |
| **HPO** | Permissive and commercial-friendly, but on three conditions — and one was being breached: *"any HPO Consortium file(s) displayed publicly include the date(s) and/or version number(s)"*. The HPO annotation API reports no version, so the release now comes from EBI OLS4 and is shown on the panel (2026-09-01). **Still outstanding:** the licence also requires a stated acknowledgement and the HPO logo in the product's online presence → an M8 obligation. |
| **GTEx** | A redistributor must either *"maintain the most current version of all distributed data, or make known in a clear and conspicuous manner"* that it does not. Chaperone pins `gtex_v10` on purpose, so the second branch applies: the panel now names the pinned release every time and states that GTEx does not endorse Chaperone (their terms also forbid implying endorsement). |
| STRING · gnomAD · ChEMBL · EBI (GWAS Catalog, IntAct, AlphaFold) | Confirmed as recorded. STRING CC BY 4.0 with attribution and a note of modifications; gnomAD "absolutely no restrictions or embargoes"; ChEMBL CC BY-SA 3.0; EBI resources freely available under their terms of use. |
| **Monarch** | Not one licence. The application is BSD-3-Clause and the data is an aggregation whose upstream terms flow through — HPO's among them. Recorded as inherited rather than claimed clean. |
| NCBI (ClinVar, dbSNP, Nucleotide) · RCSB PDB · BV-BRC | Public domain / CC0. Unchanged. |

### 5.7 Code conventions

- TypeScript, strict mode. No `any` in connector return types.
- One file per connector. A connector is a pure function: identifiers in, normalised panel data out. No rendering, no state.
- Shared normalisation in `lib/normalise.ts`. Connectors do not reimplement it.
- Dependencies: as few as possible, pinned exactly, each justified in section 13. Default answer to a new dependency is no.
- No client-side calls to third-party APIs. Everything through our own route handlers — CORS, key safety, caching, rate control.

### 5.8 Documentation duty

- This file is updated **in the same change** as the code it describes.
- Every decision that changes the plan gets a dated line in section 13.
- `README.md` covers how to run it. Rationale belongs here.

### 5.9 Answers belong in the conversation (added 2026-11-16, your instruction)

- **A question gets an answer in the chat.** Not a PDF, not an HTML page, not an artifact, not a Markdown file, not a `.docx` — the answer is typed out in the reply, under the question, where you can read it without opening anything.
- This applies to everything that is *asked*: an explanation, a comparison, a list, a flowchart described in text, a status check, "what does X do", "which of these is better". If it can be read, it gets read in the reply.
- A file is produced only when the file **is** the deliverable: project code, `PROJECT-PLAN.md` and the other documents in this repository, something you explicitly ask to be given as a file ("make me a PDF of…", "save that as…"), or a thing that only exists as a file (a resume, a published page you intend to send to someone).
- When something is genuinely too large or too visual for a reply, the answer still goes in the reply **first**, and a file is then *offered* — not created and announced.
- Rationale: a file for a question costs a round trip to open, lives somewhere that has to be found again, and buries a two-paragraph answer in a container. Chat scroll-back was ruled out for the *plan* (section 4) because the plan must be editable and durable; that ruling was never about answers to questions.

## 6. Data source inventory — TESTED 2026-11-04

Method: one real request per endpoint, test subject `SCN9A` / `Q15858` / `ENSG00000169432` / `rs1333049`. Script: `scripts/verify-sources.mjs` (moves into the repo at M1). **27 endpoints tested, 20 passed on the first pass; three recovered after correction; four dropped.**

### 6.1 Verified — build against these

| Resource | Layer | Endpoint used | Latency | Returned | Licence | Status |
|---|---|---|---|---|---|---|
| **UniProt** | Target | `rest.uniprot.org/uniprotkb/search` | 1.1 s | `Q15858`, + HGNC, GeneID, Ensembl xrefs | CC BY 4.0 | ✅ verified |
| **gnomAD** | Mechanism | `gnomad.broadinstitute.org/api` GraphQL | 0.8 s | pLI, LOEUF 0.810, mis_z | open | ✅ verified |
| **GTEx v2** | Target | `/api/v2/reference/gene?gencodeVersion=v39` + `/expression/medianGeneExpression?datasetId=gtex_v10` | 0.7 s / 1.2 s | gencodeId, **54 tissues** | open | ⚠️ **re-verified 2026-11-05 — both params now REQUIRED.** Unpinned, the two endpoints use different GENCODE releases and return 200 + `data: []`. See M4 finding 1 |
| **Reactome** | Target | `/ContentService/data/mapping/UniProt/{acc}/pathways` | 2.0 s | 3 pathways | **CC0** for the data (was recorded as CC BY 4.0, which covers only their illustrations and branding, which we do not use) | ✅ verified |
| **RCSB PDB** | Mechanism | `search.rcsb.org/rcsbsearch/v2/query` | 1.5 s | **44 structures** | CC0 | ✅ verified |
| **AlphaFold** | Mechanism | `/api/prediction/{acc}` | 0.7 s | `AF-Q15858-F1`, 1988 aa | CC BY 4.0 | ✅ verified |
| **ChEMBL** | Drug | `/chembl/api/data/target/search` | 1.4 s | 3 targets | CC BY-SA 3.0 | ✅ verified |
| **PubChem** | Drug | `/rest/pug/compound/name/…` | 1.4 s | CID 3676 | public domain | ✅ verified |
| **Open Targets** | Condition | `api.platform.opentargets.org` GraphQL | 0.8 s | **771 associated diseases** | CC0 | ✅ verified |
| **STRING** | Target | `/api/json/network` + `caller_identity` | 0.8 s | 15 edges | CC BY 4.0 | ✅ verified |
| **GWAS Catalog v2** | Evidence | `/gwas/rest/api/v2/associations?mapped_gene=` · `/single-nucleotide-polymorphisms/{rs}` | 7.5–17 s | associations w/ EFO traits, p-values | open | ⚠️ **re-verified 2026-11-05. `?gene_name=` and `?rs_id=` are SILENTLY IGNORED** — they return the whole catalogue with a 200. Use `mapped_gene`, and the path-addressed SNP endpoint. See M4 finding 2 |
| **Monarch v3** | Condition | `/v3/api/entity/{HGNC}` + `/association` | 1.5 s / 0.3 s | SCN9A, **67 phenotype associations** | open | ✅ verified |
| **HPO** | Condition | `/api/network/search/gene` → `/api/network/annotation/NCBIGene:{id}` | 1.1 s | erythromelalgia, HSAN2, PEPD | HPO licence | ✅ verified **(2-step, NCBIGene id)** |
| **IntAct** | Target | `/intact/ws/interaction/findInteractions/{sym}` | 0.4 s | 19 interactions | CC BY 4.0 | ✅ verified |
| **Human Protein Atlas** | Target | `proteinatlas.org/{ensg}.json` | 1.1 s | full gene record | **CC BY 4.0** (was recorded as CC BY-SA 3.0; corrected on the 5.6 re-read — commercial use explicitly encouraged) | ✅ verified |
| **BV-BRC** | Pathogen | `/api/genome/?eq(...)` | 4.1 s | 2 genomes | public domain | ✅ verified (slowest) |
| **NCBI ClinVar** | Condition | E-utilities `esearch db=clinvar` | 1.4 s | **3,154 records** | public domain | ✅ verified |
| **NCBI dbSNP** | Evidence | E-utilities `esummary db=snp` | 0.9 s | alleles + MAF across 8 studies | public domain | ✅ verified **(replaces Ensembl variation)** |
| **NCBI Virus** | Pathogen | E-utilities `esearch db=nuccore` | 0.9 s | 9.2 M SARS-CoV-2 sequences | public domain | ✅ verified |

### 6.2 Key-gated — optional, degrade to deep link (built second, per 10.6)

| Resource | Why gated | Env var | Status |
|---|---|---|---|
| NCBI E-utilities | works keyless at 3/s; key raises to 10/s | `NCBI_API_KEY` | ✅ keyless path verified |
| OMIM | free academic key, per-person | `OMIM_API_KEY` | ⬜ gate in place, untested |
| BioGRID / ORCS | free self-service key | `BIOGRID_API_KEY` | ⬜ gate in place, untested |
| Synapse (PsychENCODE) | free account + token | `SYNAPSE_TOKEN` | ⬜ gate in place, untested |

### 6.3 Dropped from v1 — with evidence

| Resource | Reason | Revisit? |
|---|---|---|
| **PharmGKB** | **`api.pharmgkb.org` does not resolve — `ENOTFOUND`.** The documented API host is gone. Separately, PharmGKB restricts commercial use, which now disqualifies it anyway. | Only if they publish a new host *and* commercial terms allow |
| **Expression Atlas** | Every gene-level endpoint tested returned 404. Only the experiment index works, which is not a per-gene lookup. GTEx + HPA cover expression. | v2 |
| **WikiPathways** | `findPathwaysByText.json` **ignores the query** — identical output for `SCN9A` and `ZZZZQQQQ`. It is a static index dump, not a search, and carries no gene membership. Reactome covers pathways. | v2 |
| **KEGG** | Free for academic use only; commercial needs a paid licence. **Project is commercial (10.1).** | Only with a purchased licence |
| **DrugBank** | API commercially licensed. ChEMBL covers the need. | No |
| **GISAID** | Terms forbid this use; per-user registration. | No — deep link |
| **HGMD / COSMIC** | Subscription / commercial licence. | No |
| **CELLxGENE Census** | Python/R client, no REST surface for per-request lookup. | v2 |
| **UK Biobank, dbGaP, All of Us, iPSYCH, MVP, FinnGen individual, 23andMe** | Controlled access. Out of scope by section 3. | No — deep link to their application pages |

### 6.4 Deep-link only — pre-filled URLs, no API call

**22 links** (20 built and verified in M6; **PheGenI added 2026-11-19, the All of Us Data Browser 2026-11-21**). `lib/deeplinks.ts` is the source of truth; `npm run verify:deeplinks` checks them.

SCHEMA · BipEx · FinnGen PheWeb · Pain Genes Database · Human Pain Genetics Database · DECIPHER · DepMap · Mouse Phenome Database · CZ CELLxGENE · Expression Atlas · WikiPathways · PharmGKB/ClinPGx · OMIM · Allen Brain Map · Nextstrain · GISAID · **human DRG expression (§11.5)** · **PheGenI (§6.4a)** · **All of Us Data Browser (§6.4a)** · UK Biobank · dbGaP · All of Us.

Rendered as a strip of buttons that open the right page for the current gene, so the researcher still never re-types an identifier or hunts for a URL.

Each link records **what it lands on** (`record` / `prefilled-search` / `index`) and **how that was established** (`verifiedBy`), because a button that silently lands on a generic page is the §5.4 failure in another costume: our limitation read as the source's answer. Changes found on 2026-11-06 are in the M6 findings below.

### 6.4a PheGenI — a gene-addressable way into controlled-access material (added 2026-11-19)

**The problem.** UK Biobank, dbGaP and All of Us were `requires: []` with a fixed homepage URL. A researcher who searched SCN9A, read the panels and clicked **dbGaP** lost their gene: the button opened an application landing page that knows nothing about what they were looking at. §6.4's own rule says a button that drops someone on a generic page teaches them the resource has nothing for them — and these three were doing exactly that, to the three resources where the cost of a wrong conclusion is highest, because the alternative is a months-long application.

**What was added.** NCBI's **Phenotype-Genotype Integrator (PheGenI)** — `/gap/phegeni?tab=1&gene={symbol}` — is open, needs no sign-in, and reports the GWAS associations, SNPs and eQTLs that the *controlled* dbGaP studies produced, filtered to one gene, **naming the `phs` study accessions**. It answers the question a researcher actually has at that moment, which is not "let me log in" but *is there anything in there for my gene, before I spend three months on a Data Use Certification*.

It is a **second** entry, not a replacement. The `access` field drives the UI's grouping, and PheGenI genuinely is `open` while dbGaP's application route genuinely is `application`; collapsing them would have filed an open page under "these need your own credentials", or dropped the application route for anyone who decides to apply. dbGaP's note now points at PheGenI instead.

**The finding, which is the part worth keeping.** *This link was nearly added on evidence that proved nothing, by a check that could not fail.* A scripted fetch of the PheGenI URL returns **200 with 68 kB and the gene symbol present in the body** — which reads as a pass, and is worthless:

| Subject | fetched size | symbol in body | `phs` accessions in body |
|---|---|---|---|
| `SCN9A` | 68,510 B | yes (12×) | **0** |
| `FOXP2` | 69,019 B | yes (12×) | **0** |
| `OR4F5` | 68,630 B | yes (12×) | **0** |
| **`ZZZZQQQQ`** | 63,883 B | **yes (7×)** | 0 |

The symbol is in the body because **the page echoes the query back into its own form**, and a nonsense string does it too. No `phs` accession appears in *any* fetched body, because the result tables are filled in by JavaScript after load. "Symbol in body" was measuring an echo. Had this been recorded as `verifiedBy: 'fetch'`, the check would have gone green forever and told us nothing — the WikiPathways failure (§6.3) in a new costume.

**Established in a browser instead, with a nonsense-identifier control**, which is what `verifiedBy: 'browser'` means. The three states separate cleanly, and PheGenI distinguishes them *itself*:

| Subject | Genes | Association Results | SNPs | eQTL | reading |
|---|---|---|---|---|---|
| `SCN9A` | 1 of 1 | **5 of 5** (phs000342, phs000215) | 74,761 | 46 | data |
| `OR4F5` | **1 of 1** | **No data found** | 3,939 | 2 | real gene, genuine absence — §5.4 state 2 |
| `ZZZZQQQQ` | **No data found** | No data found | No data found | — | not a gene at all |

That is the §5.4 distinction between *no entry* and *no such subject*, made by the source itself, so the link's `note` tells the researcher how to read an empty table rather than leaving it to be misread as a dead link.

**One more silently-ignored parameter.** PheGenI takes the **symbol**; `?gene=6335` (the NCBI GeneID) returns 200 with no gene record at all. Same trap as the GWAS Catalog's `?gene_name=` (§6.1). Only `ids.symbol` is sent, and per §6.5 it comes from the resolver, never a literal.

**All of Us — done 2026-11-21, and the guessed URL was wrong.** The same treatment was applied to the second of the three. The **All of Us Data Browser** is open, aggregate and gene-addressable: allele counts and frequencies across **535,680 short-read whole genomes** out of a 747,040-participant cohort, with ClinVar significance and consequence per variant. That is not a second copy of the gnomAD panel — All of Us is deliberately ancestrally diverse, which is the exact axis on which gnomAD is thinnest, so for a non-European subject the two disagree in a way that is itself informative.

The useful part of doing this one: **the path assumed on 2026-11-19, `/variants/{gene}`, was a guess and was wrong.** It returns the SPA shell and nothing else — indistinguishable, to a script, from a working page. Writing it in would have shipped a button that silently went nowhere. The real scheme, `/snvsindels/{symbol}`, was found only by driving the UI and watching where it went, and direct URL navigation was then confirmed separately from clicking through the search box.

Verified by hand with the same control discipline:

| Subject | variants reported | table rendered | reading |
|---|---|---|---|
| `BRCA2` | 49,410 | yes | data |
| `SCN9A` | 105,403 | yes | data |
| `OR4F5` | 10,509 | yes | an obscure real gene still has data |
| `ZZZZQQQQ` | **0** | **no** — falls back to the query prompt | not a gene |

Note the contrast with PheGenI, and why each link's note is worded differently: for PheGenI an empty result is ambiguous until you read the `Genes` row, because a real gene can genuinely have no catalogued association. Here it is unambiguous — every real gene carries variation across half a million sequenced genomes, so **0 means the symbol is not a gene**, never that the cohort has nothing to say.

**Still not done: UK Biobank.** It stays an index link. Showcase is searchable and server-rendered, but it indexes *phenotype fields, not genes*, and echoes the query back — linking it per-gene would be precisely the mistake above. The honest per-gene route for UK Biobank exome results is Genebass, which is third-party and client-rendered and redirects host; revisit it as its own decision rather than smuggling it in under a UK Biobank label.

### 6.5 Two findings that changed the architecture

**1. Ensembl is unreliable and must not be on the critical path.**
`lookup/symbol` took **12.1 s**. `variation/human/{rs}` returned **503**, then timed out at 25 s on retry. Only `xrefs/symbol` responded promptly.

Consequence: **the resolver does not use Ensembl.** One UniProt call returns the UniProt accession, `HGNC:10597`, NCBI GeneID `6335` and Ensembl transcript IDs in ~1 s. GTEx `reference/gene` supplies the versioned `ENSG…14` gencode ID. dbSNP via E-utilities replaces Ensembl variation. Ensembl stays as an optional 3-second fallback only.

**2. Identifiers must always be derived, never hardcoded.**
Pass 1 passed `HGNC:10596` for SCN9A. Monarch dutifully returned **SCN8A** — a different sodium channel, adjacent on the same chromosome, plausible enough to pass a careless eye. The correct ID is `HGNC:10597`.

This is exactly the failure mode Chaperone exists to prevent, and it nearly shipped into the plan. Rule: **no identifier is ever written as a literal in connector code.** Every ID comes from the resolver, which derives it from UniProt. The test suite asserts cross-source agreement on the symbol, so a mismatch fails loudly instead of rendering the wrong gene's data under the right gene's name.

## 7. Acceptance criteria

Done when all pass **against live APIs**:

**Resolution**
1. `SCN9A` resolves to HGNC `10597`, NCBI GeneID `6335`, UniProt `Q15858`, ENSG `ENSG00000169432` without the user choosing anything.
2. `rs1333049` resolves via dbSNP to alleles and MAF.
3. `Q15858` and `ENSG00000169432` resolve to the same gene as `SCN9A`.
4. `neuropathic pain` resolves to a trait with associated genes. **Was failing until M7:** a trait resolved to an EFO id and nothing else, because no panel takes an EFO id. Open Targets' disease→targets direction now supplies them (934 for neuropathic pain, led by the calcium-channel subunits), which is also what gives a trait search somewhere to go.
5. An unrecognised string gives a helpful message, not a crash.
6. **Every panel independently reports the symbol it resolved; any disagreement is shown as a warning, not silently rendered.**

**Panels**
7. Every source in 6.1 renders data or one of the three non-data states in 5.4.
8. Killing the network mid-load marks the failed panels `unavailable` and leaves every other panel's answer intact.
   - **8b (interface half, M8):** and leaves *the page itself* usable. Split out 2026-11-06 — this half cannot be checked before an interface exists, so it cannot close at M7. **Induced 2026-11-09:** three connector timeouts cut to 1 ms while GWAS Catalog was independently 500ing upstream — 4 of 15 panels failed, 11 kept their data, every control stayed live and the suggestion rules still ran.
9. No panel shows a number without a working link to its source record.
10. A source that has no record for a subject renders **`empty`**, never `unavailable`. (Regression test for the gate-1 404-is-not-failure case.) **Reworded 2026-11-06.** It read "`rs6746030` in the GWAS Catalog panel shows 'no catalogued association'", and that subject no longer exercises it — rs6746030 now resolves *through* dbSNP to SCN9A, so the GWAS panel queries by symbol and legitimately returns data. The check was passing while testing nothing. It is now checked against `OR4F5`, which returns a genuine absence from six sources, plus the stronger assertion that no absence anywhere in the run is reported as a failure.
    - **10b (new, 2026-11-10 — §11.7a, `npm run verify:absence`):** *An absence is confirmed before it is reported.* A 404 or 410 is asked again once, after 2.5 s. Only a second identical answer becomes `empty`; a second request that succeeds yields the data; one that fails differently yields `unavailable`, because absence was not established. **This cannot be checked against a live source.** It needs a source that returns 404 and then 200 for the same URL seconds later — which is the load-shedding behaviour itself, and cannot be requested from anybody's API without abusing it. So it runs against a scripted local server: no external traffic, every branch reachable, **17 assertions over 7 cases**. 204 is deliberately excluded (a source answering "no content" has answered) and a 5xx is never re-probed (§5.3 — a 5xx is the server's decision, not a blip). **Proved able to fail** by emptying `CONFIRM_ABSENCE_STATUSES`, which reproduces the pre-fix behaviour exactly: 11 of 17 assertions went red, the telling one being *got `(empty) 404 — source has no record for this subject`, want 42* — a panel denying a record that exists. That control also caught a flaw in the harness, which **threw** instead of failing cleanly; a test that crashes on the failure it exists to detect is no better than no test, so it was fixed to read through the state.

**Performance and conduct**
11. First meaningful panel renders under 2 s on a warm cache.
12. A repeated identical query inside the TTL makes zero upstream requests, verifiable in logs.
13. Every outbound request carries the Chaperone `User-Agent`; STRING carries `caller_identity`.
14. No API key appears in any client bundle. Verified by grepping the build output. **Re-done 2026-11-09 with a proven positive control** — five canary secrets in `.env.local` appear in no build artefact at all, because Node reads them at runtime and Next inlines only `NEXT_PUBLIC_*`, so the grep was passing whether or not a leak was possible. A `NEXT_PUBLIC_` canary rendered into a DOM attribute *is* found, in `static/chunks/app/page-*.js`; the same grep finds zero of the five real secrets in that same bundle. The check is now known to be able to fail.
15. No field anywhere in the UI accepts a third-party credential. (Enforces 3.1.) **Verified at M8, not M7** — before the interface is built this is vacuously true, and a criterion that passes because the thing it governs does not exist yet has not been tested. It is re-checked after every interface milestone. **Automated 2026-11-09** as a fail-closed scan over every component's source, not over one browser page. **Rewritten later the same day, when §11.9 added a file input.** It used to read "exactly one field exists and it is the search box", which enforced the rule by counting. Counting was right while one input was the whole interface and stops being right the moment a second legitimate field exists — a check that forbids every new field gets loosened in a hurry by whoever needs one. It now checks by **shape and an explicit allowlist**: every field is enumerated with its declared `type`, each must appear in the allowlist *with a stated reason*, no `password`/`email`/`tel` input may exist anywhere, and no element may carry credential-shaped markup. The credential detector is **fired at a synthetic password field before the real result is trusted**. Proved able to fail 2026-11-09 by inducing `<input type="password" name="api_key" placeholder="UK Biobank token">` in `Attributions.tsx` — three separate red lines, then reverted.
    - **15b (new, 2026-11-09):** *Nothing a researcher supplies is transmitted except identifiers they could have typed.* This is the guarantee that makes a file input acceptable at all (§11.9), so it is checked rather than asserted in a comment. Three structural assertions — `lib/structure.ts` performs no I/O of any kind; `StructureDrop.tsx` never calls `fetch`; **no API route can accept a file body** (no `formData`, `arrayBuffer`, `blob` or `multipart` anywhere in `app/api/`), so there is nowhere to upload to even by mistake. All three detectors fire at synthetic violations first. Proved able to fail by inducing `await fetch('/api/panel', { method: 'POST', body: text })` in the drop handler, then reverted. Confirmed live in the browser too: dropping a 1 MB structure produced **zero network requests**.

**Domains**
16. Each preset **filters** panels without reordering them; the antiviral preset surfaces BV-BRC and NCBI Nucleotide. (Corrected 2026-11-06: this criterion said "reorders", which contradicts your 11.2 decision and the `forPreset` implementation. A criterion that disagrees with the decision it is meant to check would have failed a correct build.)
17. Suggestions link to a real next query and name the rule that produced them.

## 8. The suggestion engine — what "prediction" means here

You asked that the box take the simplest entry and that further predictions follow from it. To be precise:

**It is** rule-based navigation. After a result loads we know facts about the gene — its family, constraint score, whether a structure exists, its interaction count, its associated traits. Rules map those facts to a next query. An ion channel with pain-trait associations surfaces the pain preset and its paralogues; a tolerant gene with many viral interactions surfaces the antiviral host-factor view; GWAS hits with no structure surfaces AlphaFold.

**It is not** a model inferring biology. No claim about a gene's function is generated. Every suggestion is a link to a query against a real source, labelled with the rule that produced it, so you can see why it was offered and ignore it.

This keeps the tool honest and debuggable.

## 9. Architecture and file organisation

### 9.1 Shape

Browser → Chaperone route handler → upstream API. The browser never talks to a third-party API directly. That one decision solves CORS, key safety, caching and rate control together.

### 9.2 Tree

Actual state after M8. Everything listed exists.

```
chaperone/
├── PROJECT-PLAN.md            ← this file; the agreement
├── README.md                  ← how to run it, nothing else
├── LICENSE                    ← proprietary, all rights reserved (10.1)
├── .env.example               ← every optional key, blank, commented
├── .gitignore
├── package.json · tsconfig.json · next.config.mjs
│
├── app/
│   ├── layout.tsx · globals.css
│   ├── page.tsx               ← composition only: useLookup() + tab/preset view state (M8)
│   └── api/
│       ├── resolve/route.ts   ← input → canonical identifiers + deep links
│       ├── panel/route.ts     ← one dispatcher; validates filters against the catalogue
│       ├── filters/route.ts   ← the filter vocabulary, in funnel order (11.8)
│       ├── suggest/route.ts   ← section 8 rules; verifies each query resolves
│       └── diag/route.ts      ← DEV ONLY: outbound counter + UA echo (7.12, 7.13)
│
├── lib/
│   ├── types.ts               ← Identifiers, PanelResult, PanelState (4 states)
│   ├── detect.ts              ← what did the user type?
│   ├── resolve.ts             ← UniProt-first; trait AND organism for free text
│   ├── lookup-ids.ts · uniprot-record.ts · dbsnp.ts · taxonomy.ts
│   ├── gtex-gene.ts · gtex-dataset.ts   ← the pinned GENCODE pairing (M4)
│   ├── registry.ts            ← single list of connectors + metadata
│   ├── http.ts                ← the only outbound call site: UA, timeout, 1 retry, cache
│   ├── cache.ts               ← TTL cache
│   ├── presets.ts             ← antiviral / psych-neuro / pain + trait vocabularies
│   ├── deeplinks.ts           ← section 6.4, 20 links with `lands` + `verifiedBy`
│   ├── filters.ts             ← 15 facets, each with mode + the probe that proved it (11.8)
│   ├── structure.ts           ← PDB/mmCIF metadata reader; PURE, performs no I/O (11.9)
│   ├── signals.ts             ← reads facts back out of panels; fails closed
│   ├── suggest.ts             ← section 8 rules; never derives a symbol
│   └── connectors/            ← 18 files, one per verified source
│       ├── uniprot.ts · gnomad.ts · clinvar.ts · pdb.ts · alphafold.ts · chembl.ts
│       ├── reactome.ts · string.ts · intact.ts · gtex.ts · hpa.ts
│       ├── opentargets.ts · gwascatalog.ts · monarch.ts · hpo.ts · dbsnp.ts
│       └── ncbivirus.ts · bvbrc.ts          ← pathogen; subject is an organism (11.6)
│
├── components/
│   ├── useLookup.ts           ← ALL fetching + sequencing; generation counter (M8)
│   ├── Panel.tsx              ← all four states (M1, kept — it was already right)
│   ├── SearchBox.tsx          ← input 1 of 2: a subject (7.15 / criterion 15)
│   ├── StructureDrop.tsx      ← input 2 of 2: a file, parsed here, never sent (11.9 / 15b)
│   ├── FilterBrowser.tsx      ← the filter vocabulary; typing narrows, never reorders (11.8)
│   ├── ResolvedIdentity.tsx   ← ids, organism, trait genes, ambiguity notes
│   ├── PresetBar.tsx          ← filters; names the hidden count (11.2 / criterion 16)
│   ├── PanelGrid.tsx          ← layer groups, everything at once; never sees the preset
│   ├── Suggestions.tsx        ← renders the RULE and its reason (criterion 17)
│   ├── DeepLinkStrip.tsx      ← open vs gated; credentials happen at the source (3.1)
│   └── Attributions.tsx       ← the HPO and GTEx licence obligations (5.6)
│
└── scripts/
    ├── verify-sources.mjs     ← gate 1 / gate 5 harness, re-runnable
    ├── verify-deeplinks.mjs   ← the 6.4 strip; only fails what it can judge (14.3)
    ├── verify-criteria.mjs    ← the section 7 criteria, one line each (M7)
    ├── verify-absence.mjs     ← criterion 10b against a scripted local source (11.7a)
    └── probe.mjs              ← THE verification instrument (14.1, 14.3)
```

### 9.3 Why this layout

- **`lib/connectors/` is the only place that knows a third-party API exists.** Adding a source is one new file plus one line in `registry.ts`.
- **`registry.ts` is the single source of truth** for what exists, its layer, its required identifier, its presets. The UI is generated from it, so the dashboard and section 6 cannot drift apart.
- **One dispatcher route, not nineteen route files.** Nineteen near-identical files is the thing that rots.
- **`components/` holds no fetching, `lib/` holds no JSX.** That boundary is what makes panels independently testable.
- **`scripts/verify-sources.mjs` stays in the repo** so gate 1 is re-runnable. APIs change — the GWAS Catalog retired v1 and PharmGKB's API host vanished, both since this project was conceived.

## 10. Decisions you have made

- [x] **10.1 Commercial.** → KEGG excluded (paid licence). PharmGKB excluded (also dead API). Share-alike sources are display-only. **Vercel's Hobby plan is non-commercial-only, so a public commercial deployment needs Pro** — ⚠️ **this stopped being hypothetical on 2026-11-11**, when the public deployment went live. See §15.2.
- [x] **10.2 Name: Chaperone.** Folder renamed.
- [x] **10.3 Contact: a URL, not an email** (stable, identifies the project not a person, no address in third-party logs). Settled 2026-11-11 as the **deployed site** rather than a repo, since the deployment exists and the repo still does not → 10.8.
- [x] **10.4 Public deployment, public APIs only.** Private databases: the user is sent to the source to authenticate there. Codified as the hard rule in section 3.1.
- [x] **10.6 Keyless path first**, key gates left in place and unused.
- [x] **10.5 Licence for Chaperone's own code: proprietary, all rights reserved.** `LICENSE` written 2026-11-05. **Not** the MIT this section originally defaulted to: §10.1 makes this commercial, and MIT would let anyone take the code. Proprietary is the non-foreclosing default — it can become MIT with one word from you, whereas code already distributed under MIT cannot be recalled. Covers Chaperone's own code only; the data it retrieves keeps its own terms (§5.6).
- [x] **10.7 Git — SETTLED 2026-11-26: under version control, public repo.** You asked for `git init` on 2026-11-05 and it was blocked for three weeks on the wrong diagnosis. `/usr/bin/git` is indeed the Xcode stub and still refuses every invocation, but it is not the only git on the machine: **`/Library/Developer/CommandLineTools/usr/bin/git` (2.39.2) works with no licence and no `sudo`.** The blocker was never the licence, it was assuming `git` meant `/usr/bin/git`. The preparation recorded here held up exactly as written — `.gitignore` covered §5.1 in full and the first commit took 70 files, 13,779 lines, with nothing from `node_modules`, `.next`, `.vercel` or any env file. Repo: <https://github.com/discepolociliano-blip/chaperone>, branch `main`, **public by your decision** (the default offered was private). Scanned before publishing: no key, no email, no local path in any tracked file; the only populated value in `.env.example` is the public contact URL. **Note for future sessions:** `gh repo create --push` fails here because `gh` shells out to plain `git`; push with `/Library/Developer/CommandLineTools/usr/bin/git -c credential.helper='!gh auth git-credential' push`.
- [x] **10.8 Contact URL — SETTLED 2026-11-11: the deployed site.** `CHAPERONE_CONTACT_URL=https://chaperone-cyan.vercel.app`, set as a Vercel Production environment variable, so the User-Agent sent to all eighteen public APIs now reads `Chaperone/0.1.0 (+https://chaperone-cyan.vercel.app)`. It waited on a repo that §10.7 is still blocked from creating, while the thing a contact address is *for* — somewhere an upstream administrator can land and find out what this traffic is — now exists and is public. **Three candidates, and why this one:** the repo URL does not exist; your email is personal data and would be copied into eighteen third parties' logs; the site is public, stable across redeploys, and discloses nothing about its operator. **Deliberately the short `chaperone-cyan` alias, not the long `chaperone-<account>-projects` deployment URL** — the long form embeds the Vercel account handle, and a contact address should identify the tool, never the person running it. The `'TBD'` fallback in `lib/http.ts` is kept on purpose: an unset variable means a misconfigured deployment, and saying so is better than inventing an address that resolves nowhere, which is exactly the trap `scripts/verify-deeplinks.mjs` had fallen into with its `github.com/TBD/chaperone` default.

## 11. Open questions

Tagged by the milestone that needs the answer. **All design questions are now
resolved; only 11.7 remains, and it is not needed until deployment.**

| # | Question | Needed by | Answer |
|---|---|---|---|
| 11.1 | Include licence-restricted sources? | — | **No.** Resolved by 10.1 (commercial). |
| 11.2 | Presets, or one fixed order with filters? | M6 / M8 | **One fixed order with filters.** See 11.2 below. **Which** order was reset 2026-11-09 to your query spine — see 11.2a. |
| 11.3 | Everything at once, or a summary that expands? | M8 | **Everything at once.** |
| 11.4 | Will anyone else use this? | M8 | **Not until it is complete.** The interface is built for you; it does not need to teach a stranger. |
| 11.5 | Does the pain side need DRG expression? | M4 | **Deep link, not a connector.** See 11.5 below. |
| 11.6 | Antivirals: host-directed, or also direct-acting? | M5 | **Host-directed only.** See 11.6 below. |
| 11.7 | Per-IP throttling and a shared cache? | M9 | ⬜ **still open**, but now has evidence behind it. Re-verification on 2026-11-06 made **Reactome return HTTP 429** for two subjects after repeated probe runs. Reactome advertises no `RateLimit` or `Retry-After` header and recovers within seconds (10 rapid requests afterwards: all 200), so the limit is real, undocumented, and triggered by sustained load — which is what concurrent public users look like. Chaperone has no outbound throttle. Panels reported `unavailable` honestly, so nothing was wrong; it is a capacity question, and it is the answer to this row. **Second datapoint, 2026-11-09 (M8):** under the criteria run's own load, `ebi.ac.uk` returned **HTTP 404** for two IntAct record URLs that `curl` and a fresh `node fetch` both served 200 seconds later. Five of our sources share that host — UniProt, IntAct, the HPO release lookup, Expression Atlas and OLS4 — so a single page load already concentrates traffic there. EBI sheds it with a 404, not a 429, which means throttling arrives disguised as "no such record": the one status we treat as a source's genuine answer. That is worse than Reactome's honest 429, and it raises the stakes on this row from capacity to correctness. **Split 2026-11-10: the correctness half is CLOSED (§11.7a) — an absence is now confirmed before it is reported, so a shed 404 can no longer be printed as "this source has no record". The capacity half stays open for deploy: nothing throttles our outbound traffic, there is no shared cache across processes, and the confirmation adds one request per absent subject to a host that was already shedding.** |

**11.2 — one fixed order with filters.** Panels always appear in the same place,
grouped by the layer order in §9. A domain selection filters the set down rather than
reshuffling it. This is the better call: a researcher who learns where the gnomAD
panel sits should find it there every time, and a layout that rearranges itself
between queries costs more in re-orientation than it saves in scrolling.
Consequence: `forPreset` filters, it does not sort.

**11.2a — WHICH fixed order. Set 2026-11-09; this is your spine, verbatim:**

```
(disease OR condition)
AND (target OR pathway OR biomarker)
AND (drug OR compound OR therapeutic class)
AND (mechanism OR efficacy OR safety)
AND (study type OR population)
```

| # | Layer | Label on screen | Panels, in order |
|---|---|---|---|
| 1 | `condition` | Disease & condition | Open Targets · ClinVar · HPO · Monarch |
| 2 | `target` | Target, pathway & biomarker | UniProt · Reactome · STRING · IntAct · GTEx · HPA |
| 3 | `drug` | Drugs & compounds | ChEMBL |
| 4 | `mechanism` | Mechanism & safety | RCSB PDB · AlphaFold · gnomAD |
| 5 | `evidence` | Study type & population | GWAS Catalog · dbSNP |
| — | `pathogen` | Pathogen | NCBI Nucleotide · BV-BRC |

**This replaced `identity · molecules · pathways · cells · genetics · pathogen`**, which
was the order the *sources* fall into rather than the order a researcher works in. It led
with structure and chemistry and ended with disease. The web research on 2026-11-09 found
no single published ordering, but three things pointed the same way: Open Targets' own
Target Prioritisation puts Tractability second and Safety last and treats genetics as what
gets you a target at all; the neurodegeneration literature runs genetics → integration →
prioritisation → validation; and the host-directed antiviral literature runs dependency →
essentiality filter → tolerance → druggability. All of them start from the condition. We
were leading with the answer to a question nobody had asked yet.

**It also settles the neuro/antiviral conflict without breaking 11.2.** A constrained,
essential gene is a promising neuroscience target and a disqualifying host-directed
antiviral one — the same gnomAD LOEUF and DepMap number read in opposite directions.
Under the old order that argued for letting presets reorder, which 11.2 forbids. Starting
from the condition means the researcher has already established which reading applies
before they reach the Mechanism & safety layer, so the panel never has to guess and no
preset has to reorder. 11.2 stands unchanged; only its contents moved.

**Judgment calls worth overriding if you disagree** — each is a source that could sit in
two layers:

- **GWAS Catalog → `evidence`, not `condition`.** A GWAS association *is* a study type
  with a population, and your category 5 is where a literature search narrows by design.
  The cost: trait associations now sit near the bottom. This is the one most worth
  challenging — if you read GWAS hits as primary disease evidence, it belongs in 1.
- **ClinVar → `condition`, not `mechanism`.** It is variant-to-condition interpretation,
  and the panel reports pathogenic and VUS counts, which is disease evidence.
- **gnomAD → `mechanism`, not `evidence`.** Our panel shows LOEUF, pLI, o/e and missense
  Z — pure constraint, which Open Targets itself files under Safety. If it ever showed
  allele frequencies, that half would belong in `evidence`.
- **GTEx and HPA → `target`, not a layer of their own.** Your category 2 names *biomarker*
  explicitly, and expression is how you answer it. This is also right for neuroscience,
  where cell-type expression is an early question, not a late one.

**11.3 — everything at once.** Every panel renders on load, including the ones with
no entry. Showing a source that found nothing is information; hiding it behind an
expander makes absence look like it was never checked.

**11.5 — DRG as a deep link.** The dorsal root ganglion is where nociceptor cell
bodies sit, so it is the tissue that matters most for pain genetics, and GTEx does not
have it — GTEx carries tibial nerve, which is axon, not soma. Treating this as a data
requirement would have meant finding and verifying a new source mid-M4, which is
gate-1 work in the middle of gate 4.

Instead the pain preset carries a deep-link strip to the human DRG resources, and the
researcher authenticates at those sites themselves (§3.1). No new connector, no
credential handling, M4 unblocked. The panel says plainly that GTEx tibial nerve is
not DRG, so nobody reads one as the other.

**11.6 — host-directed only.** M5 narrows accordingly: BV-BRC and NCBI Virus stay for
organism identification and context, but viral protein structures and direct-acting
antiviral chemistry are out of scope. This matches what the rest of the inventory can
actually support — these are human genetics resources, and host-directed targeting is
the question they can speak to. Direct-acting work would need PDB viral entries,
ChEMBL pathogen targets and virus-host interaction data pulling much more weight than
v1 justifies.

**11.7a — an absence is confirmed before it is reported. Fixed 2026-11-10, at your
instruction.** This closes the correctness half of §11.7, which M8 left open because the
trade-off was yours to make.

**The failure it prevents.** Chaperone's central claim is that an absence is a finding —
"ClinVar has no submissions for this gene" is information, and §5.4 exists so that
absence is never dressed up as failure. The 404 problem is that rule running backwards:
a *failure* dressed up as an *absence*. EBI sheds load with **404, not 429**, four of our
connectors query `ebi.ac.uk` directly, and ten pass `emptyOn: [404]`. So a refusal arrived
looking exactly like an answer, and the panel stated it as fact.

**The fix, in `lib/http.ts`.** A 404 or 410 on an `emptyOn` connector is asked once more
after 2.5 s, and the three outcomes are kept distinct:

| second request | verdict | why |
|---|---|---|
| same status again | `empty` — and the message says **"asked twice"** | two witnesses; now it is a finding |
| succeeds | **the data** | the first was a refusal, not an answer |
| fails differently | `unavailable`, never `empty` | nothing was established, and *we do not know* is a different answer from *there is nothing* |

**What it deliberately does not do.** 204 is not re-probed — a source answering "no
content" has answered, and re-asking is waste. A 5xx is not re-probed — §5.3 says a 5xx is
the server's decision and hammering it is not our place. And there is no host allowlist:
encoding "EBI does this" would drift the moment another host does, and the check is cheap
enough not to need one.

**The cost, stated plainly.** One extra request and one 2.5 s pause per absent subject per
TTL, because the confirmed verdict is cached either way. Panels are fetched in parallel, so
OR4F5's five genuine absences cost one pause, not five. The uncomfortable part: under
throttling this adds a request to a host already shedding load. That is the price of not
making a claim we cannot support, and it is one request after a wait, never a loop.

**Verified 2026-11-10.** `npm run verify:absence` — 17 assertions, 7 cases, against a
scripted local server rather than a live API, for the reason given in criterion 10b. Live
suites re-run with the fix in place: `verify:criteria` **16/16**, typecheck clean. `npm run
probe` shows 4 failures, all of them upstream and all pre-existing — ChEMBL's own status
endpoint answers 200 but takes **16.5 s**, which is why a 20 s resolve budget times out
intermittently, and IntAct timed out. Both are correctly reported `unavailable`, which is
the system working. A live check of the IntAct URL that 404'd in the probe returned **404
three times running**, so that one is a genuine absence — the fix does not manufacture
recoveries.

**11.8 — the filter catalogue. Added 2026-11-09, at your request:** *"the user gets to
see all the filters that are there in all the databases in the particular order they are
there, and as the user is searching the further suggestions are shown based on the
filters that the user is attempting to get answer, but if the user clicks on a particular
filter then the results should be based on just that."*

This answers something the dashboard could not. The panels tell you what each source
says; they never told you what each source would let you *ask*. Normally you cannot
know that until you are on the site, which is a large part of why the fifteen-to-
twenty-five-tab morning exists.

`lib/filters.ts` is the catalogue: **15 facets across the 18 sources**, grouped in your
funnel order (§11.2a), never by match score. `/api/filters` serves it; `FilterBrowser`
is the tab. Typing in the search box narrows the list and never reorders it — the same
rule as §11.2, for the same reason.

**The honesty problem this created, and the shape of the answer.** A filter list is a
promise. Offering a narrowing we cannot perform would be the §5.4 failure in a new
costume — not "absence shown as failure" but "a question we cannot ask, shown as one we
can. So every filter carries a `mode`, and the interface states it on every row:

| mode | count | what it means | what clicking does |
|---|---|---|---|
| `applied` | 5 | we re-query the source with it | narrows the panel AND scopes the board |
| `pinned` | 3 | a restriction already in force that you are entitled to see | scopes the board; nothing to change |
| `handoff` | 7 | the facet exists at the source, but their API will not take it from us | scopes the board; you filter at the source |

Each of the five `applied` filters was **probed before it was written down**, and the
probe is quoted in the row the researcher reads:

- **ClinVar clinical significance** — SCN9A 3,154 unfiltered → 180 pathogenic. A bogus
  property returns **0, not everything**, so it fails closed.
- **ClinVar review status** — looked broken at first: SCN9A returns 0 for three-star.
  Positive controls settled it — BRCA1 3,434, CFTR 396, a bogus status 0. The filter is
  real and SCN9A genuinely has none.
- **STRING `required_score`** — 575 edges → 94 at the higher floor.
- **gnomAD release** — SCN9A o/e LoF **0.7005 on GRCh38 (v4)** vs **0.5489 on GRCh37
  (v2.1)**. The same gene with two defensible numbers, and most published LOEUF values
  are v2 — so the panel now names its release as a fact, not a setting.
- **PDB `exptl.method`** — Q15858 44 entries → 41 cryo-EM.

**The one deliberate refusal.** GWAS Catalog significance is listed as `handoff`, not
`applied`, because a deliberately invented `p_upper` parameter **returned the same 8
associations**. Their API accepts the parameter and silently discards it. That is the
third time this API has done this to us (`gene_name` and `rs_id` were the first two,
§6.5). Shipping it as a working filter would have produced a page that says "p < 5×10⁻⁸"
over an unfiltered list — the worst failure this project can have.

**Four judgment calls, recorded because they are arguable:**

1. **Clicking a filter scopes the board to the sources that carry the facet**, and the
   count of what went is stated — *"14 panels hidden — hidden, not empty: those sources
   do not have this facet, so they were not asked."* Same disclosure as §11.2.
2. **A `pinned` or `handoff` filter can still scope**, with a different sentence —
   *"nothing inside them is narrowed; that happens at the source."* Scoping is honest;
   claiming to narrow would not be.
3. **Typing a subject shows the whole catalogue, not an empty list.** `SCN9A` matches no
   facet name, so the browser says so — *"it reads as a subject, not a filter"* — and
   lists everything. An empty result would be technically correct and useless.
4. **A funnel stage with no filters is still listed.** Pathogen has none; it says *"no
   filter here yet,"* because a stage silently missing from your own spine is worse than
   a stage that admits it is empty.

**One correctness fix the work turned up.** The PDB connector's cache key did not include
the method, so a filtered and an unfiltered search would have collided — the researcher
would have seen 44 entries labelled "cryo-EM only", or 41 after clearing the filter.
Caught before it shipped.

**One honesty fix.** Under the pathogenic filter, ClinVar reported *"Pathogenic
180 (100.0%)"* — the filter counting itself. A tautology that reads like a finding. It
now reports **"Share of all submissions: 180 of 3,154 (5.7%)"**, and the self-referential
breakdown is suppressed for that filter only; under review-status it is kept, because
"what share of three-star records are pathogenic" is a real question.

**11.9 — the structure door. Added 2026-11-09, at your request:** *"give the user the
ability to upload the protein structure as well."*

Drop a PDB or mmCIF file and Chaperone reads the cross-references it **already
declares**, then looks that protein up across every source. `lib/structure.ts` parses;
`StructureDrop` is the tab.

**It never infers identity from coordinates.** It reports what the file states — `DBREF`
in legacy PDB, `_struct_ref` in mmCIF, `_ma_target_ref_db_details` in AlphaFold and
ModelArchive models — and nothing else. A file with no cross-reference produces no
identifier and says why. Guessing a protein from its geometry is exactly the derived
claim §5.5 exists to prevent.

**Provenance travels with every identifier.** AlphaFold's download is named
`AF-Q15858-F1-model_v6.cif`, so the accession is in the filename as well as the contents.
A name can be renamed and contents cannot, so the two are never merged: an accession read
from a filename is tagged as such, shown in amber, and carries a warning telling you to
check it. (§6.5, applied to a new kind of input.)

**§7.15 RE-ARGUED, NOT ASSUMED.** `SearchBox.tsx` has always carried the line: *if a
second input is ever added, §7.15 has to be re-argued from scratch.* This is that second
input, so:

- The rule protects §3.1 — Chaperone never handles anyone's credentials. The enforcement
  was *"there is nowhere to type one"*, which is strong because it needs no judgment.
- A file input weakens that only if a file can carry a credential **to us**. It cannot,
  because **the file never leaves the browser**: `File.text()` → `lib/structure.ts`
  (which performs no I/O) → an accession string, which is the same string you could have
  typed into the box.
- So the guarantee is **restated and strengthened**, not relaxed. Criterion 15 now checks
  **shape and an allowlist** instead of counting inputs, and **criterion 15b** is new:
  *nothing a researcher supplies is transmitted except identifiers they could have typed.*

**Why the counting check had to go.** "Exactly one input" was right while one input was
the whole interface. The moment a second legitimate field exists, a check that forbids
every new field will be loosened in a hurry by whoever needs one — which is a worse
outcome than checking the thing that actually matters. Both checks now fire a **positive
control at a synthetic violation** before their clean result is trusted, and both were
proved to fail: an induced `<input type="password" name="api_key">` and an induced
`fetch()` of the file body each produced a precise red failure, then were reverted.

**Why "never uploaded" is a feature and not a footnote.** An unpublished structure is an
unpublished result. A tool that quietly posted it to a server would be unusable by
exactly the people this is built for, whatever its privacy policy said.

**Verified against real files**, with negative controls throughout — 8 assertions on
contents, 4 on refusals:

| file | what it proves |
|---|---|
| `6J8E.pdb` (cryo-EM, 1.02 MB) | three chains → three different accessions, chain mapping intact |
| `6J8E.cif` (same entry, mmCIF) | both parsers agree on entry, method, resolution and all three accessions |
| `AF-Q15858-F1` (.pdb and .cif) | flagged `predicted model`, gene `SCN9A` and taxon `9606` read from the file |
| `1CBS.pdb` with `DBREF` stripped | finds nothing, says why, still reads the rest of the file |
| the same, renamed `AF-Q15858-F1-…` | falls back to the filename **and warns that it did** |
| a cover letter | no accession invented, no entry id invented |
| `REMARK 999 SEE ALSO Q15858` | a mention is not a cross-reference — 0 refs |

**One correctness fix found by the probe.** The mmCIF parser reported no resolution for
6J8E while the PDB parser reported 3.00 Å. Cryo-EM resolution lives in
`_em_3d_reconstruction.resolution`, not `_refine.ls_d_res_high`. The two are **different
quantities sharing a unit**, so the fix carries the distinction into the interface:
every resolution is now printed with what kind it is, and the note says resolutions from
different methods are not directly comparable.

**Cost:** 1–5 ms to parse a 1–1.8 MB file, measured in the browser. The `atom_site` loop
is skipped by line rather than tokenised, which is where that comes from.

**Open, deliberately:** a structure with no UniProt cross-reference is a dead end here.
Sequence-based identification would mean BLAST, which is a slow asynchronous service and
a new gate-1 source. The page says so and points at the search box instead.

**11.10 — the database inventory. Added 2026-11-26, at your request:** *"list at the
chaperone website by creating another section of all the databases that have been used".*

A fourth tab, **Databases**, listing every source the app can reach. Until now the only
way to answer "what is actually behind this page?" was to run a query and count panels —
which shows the sources that had something to say about that one subject, not the
inventory. The inventory was written down in §6 of this document, where no user of the
site will ever see it.

**It is generated from `lib/registry.ts` and `lib/deeplinks.ts`, never typed.** Same rule
as the panel grid (§9.3): a catalogue that can drift from the code is worse than no
catalogue, because it reads as a claim about the present. Every count on the page is
computed for the same reason — a hardcoded "18 sources" outlives the connector it counted.
The tab badge, the group totals and the distinct-source figure all fall out of the two
lists, and a source that is both queried and linked counts once.

**The split is the content, not the layout.** Two headings, because there are two
genuinely different relationships and merging them would overstate what Chaperone does:

| | What it means | Count today |
|---|---|---|
| **Queried through their APIs** | Chaperone calls it and renders the answer as a panel, with its four states and a fetch timestamp. Every value on a result page came from one of these. | 18 |
| **Linked, never queried** | Chaperone builds a URL into it and nothing more. Never called, nothing from it ever shown here, and for the credentialed ones no credential ever handled (§3.1). | 22 |

The linked group is subdivided by `access` — open, needs your own account, controlled —
and each row states where the link lands (`record`, `prefilled-search`, `index`), so the
distinction §6.4 draws is visible to the researcher rather than only to the code.

**One thing to watch in the implementation.** A `DeepLink` has no homepage field: its
`url()` is a function of identifiers, so there is no URL to show for a resource until a
query has resolved. The origin shown is derived by building the URL with throwaway probe
identifiers and keeping only scheme and host. **This is not a §6.5 breach** — the probe
values are never rendered, never requested, and everything after the host is discarded —
but it is the kind of shortcut that becomes one if somebody later prints the whole URL,
so the component says so at the point it happens.

**Not verified by you yet.** It typechecks and the production build is clean; the rendered
page has not been looked at.

## 12. Approval

Gate 4 does not begin until this is filled in.

```
Approved by:
Date:
Approved sections:        all / except: ______
Changes requested before execution:
```

## 13. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-04 | Server-side proxy for every API call | CORS, key safety, caching, rate control |
| 2026-11-04 | Next.js, local first, Vercel later | Deployment target chosen; route handlers give the server layer |
| 2026-11-04 | Partial scaffold deleted, plan written first | Your instruction: plan before code |
| 2026-11-04 | Suggestions rule-based, never generative | Scientific integrity; must be explainable |
| 2026-11-04 | Project is commercial | Your decision. Excludes KEGG, PharmGKB; Vercel Pro needed at launch |
| 2026-11-04 | Named Chaperone | Your decision |
| 2026-11-04 | **Never handle user credentials (3.1)** | Security liability + would breach controlled-access DUAs |
| 2026-11-04 | **Ensembl off the critical path** | Measured: 12 s lookup, 503 + 25 s timeout on variation |
| 2026-11-04 | **UniProt is the resolver spine** | One ~1 s call yields UniProt acc + HGNC + GeneID + transcripts |
| 2026-11-04 | **dbSNP replaces Ensembl variation** | 0.9 s, alleles + MAF across 8 studies |
| 2026-11-04 | **GWAS Catalog v2** | v1 returned HTTP 410, retired |
| 2026-11-04 | **No hardcoded identifiers anywhere** | Wrong HGNC id silently returned SCN8A for SCN9A |
| 2026-11-04 | PharmGKB, Expression Atlas, WikiPathways dropped | Dead host / 404s / query ignored — all measured |
| 2026-11-04 | Four panel states, not two | GWAS Catalog 404 means "no entry", not "failed" |
| 2026-11-04 | Approved at gate 3 | Your go-ahead; M1 begun |
| 2026-11-04 | **`requires` is OR-of-ANDs, not a flat AND list** | M1 verification: a flat list offered the UniProt panel for an rsID query, which then claimed 'empty'. "The source has nothing" and "we had nothing to query it with" are different claims |
| 2026-11-04 | **Connectors query by the route the resolver used** | M1 verification: querying "best id first" cost a second upstream call per cold lookup, missing a cache that already held the answer |
| 2026-11-04 | **Backend first, interface last — milestones reordered** | Your decision. All nineteen sources and the rules layer finish before the dashboard, so the interface is written once against a known-good backend |
| 2026-11-04 | **`scripts/probe.mjs` replaces the page as the verification instrument** | Backend-first removes "look at the page"; a harness that drives the HTTP API across many genes checks more than the eye can and survives as a regression suite |
| 2026-11-04 | **One fixed panel order; presets filter, never reorder** (11.2) | Your decision. A panel stays where it was learned; self-rearranging layouts cost more in re-orientation than they save |
| 2026-11-04 | **Everything renders at once, including empty panels** (11.3) | Your decision. A source that found nothing is information; hiding it makes absence look unchecked |
| 2026-11-04 | **Interface targets you alone until complete** (11.4) | Your decision. No onboarding or explanatory UI burden in v1 |
| 2026-11-04 | **DRG is a deep link, not a connector** (11.5) | Your decision. Avoids new gate-1 work inside M4; §3.1 keeps credentials at the source |
| 2026-11-04 | **Host-directed antivirals only** (11.6) | Your decision. Matches what human genetics resources can actually speak to; M5 narrows |
| 2026-11-04 | **GTEx supplies Ensembl and GENCODE ids** | Ensembl REST stays off the critical path; GTEx also gives the version suffix its own expression endpoints require |
| 2026-11-04 | **GWAS Catalog `mapped_genes` is the gene-context fallback for rsIDs** | dbSNP returns `genes: []` for intergenic variants such as rs1333049 |
| 2026-11-04 | **PDB entities sorted longest chain first** | Entity order is arbitrary; 6J8G resolved to the beta subunit instead of Nav1.7 |
| 2026-11-04 | **`chembl_id_lookup` replaces type guessing** | The guess failed open: a timed-out target probe produced a wrong answer for a real target |
| 2026-11-04 | **Timeouts are not retried** | Retrying doubled the worst case; a timeout is a verdict, not a blip |
| 2026-11-04 | **Per-source timeout budgets, ChEMBL at 20s** | Measured latency differs by an order of magnitude across sources |
| 2026-11-05 | **`FetchMeta` carries provenance; connectors never author it** | Eight connectors hard-coded `cached: false` + `fetchedAt: now`, presenting cached values as live (§5.4) |
| 2026-11-05 | **A panel is as stale as its stalest call** | A multi-call panel reports `cached` only if every call was a hit, timestamped from the oldest |
| 2026-11-05 | **`cache.set()` returns the instant it recorded** | Two separate `Date.now()` reads for one fetch made a warm read's timestamp precede the cold one's |
| 2026-11-05 | **IntAct is queried by accession, never by symbol** | Symbol search returns mouse records and the documented species filters do not work |
| 2026-11-05 | **A requested `limit` is never reported as a count** | STRING's "Direct partners: 20" was the limit we asked for, not a property of the gene (§5.5) |
| 2026-11-05 | **GTEx dataset and GENCODE release pinned together in one file** | The two endpoints' defaults had drifted apart, producing 200 + empty for a gene with 54 tissues |
| 2026-11-05 | **An empty GTEx result is `unavailable`, not `empty`** | For an id derived from GTEx's own record, empty cannot be biology — only version drift |
| 2026-11-05 | **GWAS Catalog queried by `mapped_gene`, never `gene_name`** | `gene_name` is silently ignored and returns all 1,205,644 associations with a 200 |
| 2026-11-05 | **A filter's own output is verified against the query** | Every GWAS row must carry the queried symbol; all rows failing ⇒ `unavailable`, not "no associations" |
| 2026-11-05 | **p-values read from mantissa/exponent, not the float** | `p_value` underflows to 0 below ~5e-324, breaking both display and ranking for the strongest hits |
| 2026-11-05 | **Monarch queried across three association categories** | One category reported "no phenotypes for COMT" while Monarch held 292 associations for it |
| 2026-11-05 | **Causal and correlated disease claims are never merged** | They are different assertions; collapsing them flattens the evidence (§5.5) |
| 2026-11-05 | **HPO diseases grouped by MONDO id** | 9 entries were 7 diseases; one disease appears once per nomenclature |
| 2026-11-05 | **An absence carries provenance** | The panel route fabricated `fetchedAt: now, cached: false` on every error path, so a cached 404 claimed to be freshly confirmed |
| 2026-11-05 | **`emptyOn` responses are cached behind a marker; 5xx and timeouts are not** | An absence is an answer worth caching; a transient failure is not, and caching it would prolong it |
| 2026-11-05 | **Every filtering endpoint gets a negative control in gate 1** | "Did a 200 come back?" cannot detect a filter that ignores its input — the failure mode of both WikiPathways and GWAS `gene_name` |
| 2026-11-05 | **Gate-1 checks assert identity, not presence** | The Monarch check passed for SCN8A; the script's own HGNC constant was the wrong id from §6.5 |
| 2026-11-06 | **GWAS Catalog budget 45s, page size kept at 50** | Re-measured at 8.0–37.9s; 25s sat mid-distribution and failed ~half the time, and a smaller page does not help |
| 2026-11-06 | **A timeout budget is set from a distribution, not a few samples** | Yesterday's 7.5–17.0s reading was too small a sample and produced a budget that failed every other call |
| 2026-11-06 | **The pathogen panels take an ORGANISM, not a gene** (§11.6) | Neither source holds human gene data; built on the house assumption both panels would have been permanently empty |
| 2026-11-06 | **Free text resolves as trait AND organism, both kept** | Nothing in the string says which, and "SARS-CoV-2" is legitimately both a virus and a disease |
| 2026-11-06 | **Organisms resolved via NCBI Taxonomy to a taxid** | A derived identifier for the pathogen panels to run on, never a literal (§6.5) |
| 2026-11-06 | **Counts are asked for server-side, never tallied from returned rows** | BV-BRC's `host_name` facet 400s and row order is arbitrary — the first 200 influenza genomes all have none |
| 2026-11-06 | **A sequence count is labelled as sequencing effort, every time** | SARS-CoV-2 : Zika is 2700:1 and records surveillance funding, not biology |
| 2026-11-06 | **No live figure is hardcoded into user-facing prose** | A caveat I wrote guessed "Zika ~22k" against a real 3,424 — §6.5's no-literals rule applies to sentences too |
| 2026-11-06 | **Where two panels must disagree, each explains the other** | NCBI title-matching vs BV-BRC's curated field differ 7000× for influenza A; an unexplained gap is worse than either figure |
| 2026-11-06 | **The M1 page is frozen, not deleted, and gets no work before M8** (§14.2) | It already does 3 of M8's 6 jobs and is already stale against M5; freezing stops the drift without destroying a usable debug view |
| 2026-11-06 | **Criteria 8b and 15 moved from M7 to M8** | Both need an interface to mean anything; at M7 they would pass vacuously, which is not a test |
| 2026-11-09 | **All fetching lives in `useLookup`; components are pure functions of props** | Four async things are in flight at once and must not spoil each other; a component that can fetch is a place a request can hide |
| 2026-11-09 | **Every lookup carries a generation number** | Without it a slow panel from the previous query lands after a new search and renders one gene's data under another's name — §6.5 arriving through async ordering |
| 2026-11-09 | **Criterion 15 is checked over component SOURCE, not a browser page** | A browser check proves the one view I opened behaved; the source check proves no view can misbehave |
| 2026-11-09 | **Criterion 16's order half is checked structurally, not by asserting a `.filter()` preserved order** | `filter` preserves order by definition, so that assertion can never fail; the real claim is that nothing sorts |
| 2026-11-09 | **An `unavailable` only violates criterion 10 when the source ANSWERED with an absence** | The old check asserted upstream uptime and failed a genuine GWAS Catalog outage for reporting itself honestly |
| 2026-11-09 | **Failed fetches stay uncached, and criterion 12 now allows for that** | Caching a failure pins an outage in place for the whole TTL and keeps serving `unavailable` after recovery |
| 2026-11-09 | **A 404 from a record URL is re-probed once before the link is called dead** | EBI sheds load from this very run with a 404 rather than a 429; one attempt cannot tell a throttled host from a dead one |
| 2026-11-09 | **A canary check is not trusted until a positive control leaks** | Five canary secrets appeared in no build artefact at all, so "no canary in the bundle" was true whether or not a leak was possible |
| 2026-11-09 | **"Not yet" must be visible wherever "nothing" is possible** | The suggestion block was absent for ~20 s while the rules waited on the slowest panel, which reads exactly like "no rule matched" |
| 2026-11-09 | **`components/Panel.tsx` kept unchanged from M1** | It already rendered all four states correctly; rewriting it to match the new files would have been churn, not work |
| 2026-11-09 | **The panel order is the researcher's funnel, not the sources' own taxonomy** (§11.2a) | Your query spine. The old order led with structure and chemistry and ended with disease; Open Targets, the neurodegeneration literature and the host-directed antiviral literature all start from the condition |
| 2026-11-09 | **Condition-first is what lets §11.2 stand** | Constraint and essentiality read oppositely for a neuro target and an antiviral one; starting from the condition means the reading is established before the panel is reached, so no preset needs to reorder |
| 2026-11-09 | **`layerHint` on deep links typed as `Layer`, not `string`** | It had already drifted — it still held the pre-funnel vocabulary after the layers were renamed, and nothing could catch it |
| 2026-11-09 | **Every filter declares a `mode`: `applied`, `pinned` or `handoff`** (§11.8) | A filter list is a promise. Offering a narrowing we cannot perform is §5.4's failure in a new costume — not absence shown as failure, but a question we cannot ask shown as one we can |
| 2026-11-09 | **GWAS significance ships as `handoff` — a deliberate refusal** | A deliberately invented `p_upper` returned the same 8 associations. Their API accepts the parameter and discards it. Third time for this API (§6.5). "p < 5×10⁻⁸" over an unfiltered list is the worst failure this project can have |
| 2026-11-09 | **No filter is written down before it is probed** | Five `applied` filters, five before/after counts, and each probe is quoted in the row the researcher reads. ClinVar review status looked broken until BRCA1 (3,434) and CFTR (396) proved it real and SCN9A genuinely empty |
| 2026-11-09 | **Typing a subject shows the whole catalogue, not an empty list** | `SCN9A` matches no facet name. "No filter matches" would be technically correct and useless; saying *it reads as a subject, not a filter* is the actual answer |
| 2026-11-09 | **A funnel stage with no filters is still listed, and says so** | Pathogen has none. A stage silently missing from your own spine is worse than one that admits it is empty — §5.4 moved up a level |
| 2026-11-09 | **The filter value is taken from our catalogue, never from the request** | ClinVar's values are E-utilities query syntax interpolated into a search term. A client-supplied value would be a query-rewrite hole |
| 2026-11-09 | **A self-referential breakdown is suppressed, not printed** | Under the pathogenic filter ClinVar reported "Pathogenic 180 (100.0%)" — the filter counting itself, a tautology that reads like a finding. Replaced by share-of-all-submissions (180 of 3,154, 5.7%) |
| 2026-11-09 | **The PDB cache key includes the method** | Caught before shipping: a filtered and an unfiltered search would have collided, and whichever ran first would be served to the other — 44 entries labelled "cryo-EM only" |
| 2026-11-09 | **A structure file is parsed in the browser and never uploaded** (§11.9) | An unpublished structure is an unpublished result. A tool that quietly posted it would be unusable by exactly the people this is built for, whatever its privacy policy said |
| 2026-11-09 | **Identity is read from what the file declares, never inferred from coordinates** | `DBREF` / `_struct_ref` / `_ma_target_ref_db_details` only. No cross-reference → no identifier, and the reason stated. Guessing from geometry is the derived claim §5.5 exists to prevent |
| 2026-11-09 | **An accession read from a filename is tagged as weaker evidence** | A name can be renamed and contents cannot. Shown in amber with a warning, and it never triggers a lookup on its own |
| 2026-11-09 | **§7.15 re-argued rather than assumed when the second input landed** | `SearchBox.tsx` has always said it would have to be. The rule survives because the file never leaves the browser — the guarantee is strengthened, not relaxed |
| 2026-11-09 | **Criterion 15 checks shape and an allowlist, not a field count** | "Exactly one input" was right while one input was the whole interface. A check that forbids every new field gets loosened in a hurry by whoever needs one, which is worse than checking the thing that matters |
| 2026-11-09 | **Resolution is printed with what KIND of resolution it is** | X-ray `d_res_high` and cryo-EM FSC 0.143 are different quantities sharing a unit, and they live in different mmCIF categories. Found because the two parsers disagreed on 6J8E |
| 2026-11-09 | **Criterion 16's no-reorder scan widened to every file on the panel path** | §11.8 added two more files that handle the spec list. A scan that cannot see where the reordering would happen is not a check. Proved by inducing a `.sort()` in `useLookup.ts` |
| 2026-11-10 | **An absence is confirmed before it is reported** (§11.7a) | §5.4 running backwards: EBI sheds load with 404, so a refusal arrived looking exactly like "this source has no record". The one claim this project cannot afford to get wrong |
| 2026-11-10 | **An unconfirmable absence is `unavailable`, never `empty`** | "We do not know" and "there is nothing" are different answers. The old code could only say the second |
| 2026-11-10 | **204 is not re-probed, and neither is a 5xx** | A source answering "no content" has answered — nothing is ambiguous. A 5xx is the server's decision and §5.3 forbids hammering it |
| 2026-11-10 | **No host allowlist for the re-probe** | Encoding "EBI does this" would drift the moment another host does. One extra request per absent subject per TTL is cheap enough not to need the special case |
| 2026-11-10 | **Criterion 10b runs against a scripted local server, not a live API** | It needs a source that 404s then 200s for the same URL seconds later — the load-shedding behaviour itself, which cannot be requested from anybody's API without abusing it |
| 2026-11-10 | **No dev-only "fetch this URL" diag route was added to test it** | That is an SSRF-shaped endpoint, and gating it on NODE_ENV does not make it the right thing to put in a project this careful about exactly that. The verify script compiles `lib/http.ts` and calls it directly instead |
| 2026-11-10 | **A harness that crashes on the failure it detects is no better than no harness** | The negative control made the test throw on `JSON.parse` rather than fail cleanly. Found only because the control was run |
| 2026-11-06 | **Criterion 16 corrected from "reorders" to "filters"** | It contradicted your own 11.2 decision and `forPreset` — a correct build would have failed it |
| 2026-11-06 | **A suggested gene symbol must be one a source named** | Deriving paralogues from a symbol's digits is a generated biological claim, and the §6.5 shape exactly; the probe asserts every suggested query appears in the panel payloads |
| 2026-11-06 | **Each deep link records `lands` and `verifiedBy`** | A button that lands on a generic page reads as "this source has nothing", which is §5.4's failure again; and five links cannot be machine-checked at all |
| 2026-11-06 | **The deep-link check fails only on DNS failure, 404/410, or a lost identifier** | Its first version reported 9 failures of which 4 were real; a check that cries wolf gets ignored, which is how a dead link would survive |
| 2026-11-06 | **A suggestion is resolved before it is offered; `NoEntry` withholds, `Unavailable` keeps** | dbSNP names non-coding genes (CDKN2B-AS1) the UniProt-based resolver cannot open; but dropping over a 503 would make a transient failure permanent |
| 2026-11-06 | **Withheld suggestions are reported, not hidden** | 9p21 is a real locus; a researcher who wanted ANRIL should be told we cannot follow it rather than find the suggestion silently absent |
| 2026-11-06 | **`signals.ts` fails closed, and the probe asserts named rules fire** | Parsing display strings rots silently; fail-closed with no test is a rules layer that quietly does nothing |
| 2026-11-06 | **A trait resolves with its associated genes** (Open Targets disease→targets) | Criterion 4 was false: a trait resolved to an EFO id no panel could use, so a trait search produced a name and no biology |
| 2026-11-06 | **Criterion 10 reworded; `OR4F5` added as the empty-state control** | It named a subject that no longer exercises the 404-is-not-failure path, so it passed while testing nothing; well-studied genes never exercise `empty` at all |
| 2026-11-06 | **Criterion 14 is tested with canary key values** | With no keys configured the grep passed on nothing — a tautology, not a test |
| 2026-11-06 | **Outbound attempts are counted at the one line they leave the process** | Criterion 12 cannot be settled by the `cached` flag, which is the cache layer reporting on the thing under test |
| 2026-11-06 | **Criterion 13 is proven by the headers a remote server saw** (`/api/diag?echo=1`) | Reading our own code shows intent, not arrival |
| 2026-11-06 | **hpo.jax.org is exempt from the record-URL status check** | It serves 404 for every client-rendered route including working ones, so status cannot distinguish a right URL from a wrong one there |
| 2026-11-06 | **HPO release version is displayed, sourced from EBI OLS4** | The HPO licence requires a version on any HPO content shown publicly, and HPO's own annotation API reports none |
| 2026-11-06 | **The GTEx panel names its pinned release and disclaims endorsement** | GTEx's terms require a redistributor to serve current data or say conspicuously that it does not; we pin `gtex_v10` deliberately |
| 2026-11-06 | **A suggestion's provenance haystack lists source fields explicitly, never all of `ids`** | `ids.query` is the user's own text; including it would let a suggestion launder the input back as if a source had named it |
| 2026-11-11 | **Next.js upgraded 15.1.6 → 16.4.6, React 19.0.0 → 19.3.1** | Not a choice: Vercel refused the deploy outright with "vulnerable version of Next.js detected", and the advisory range `9.3.4-canary.0 – 16.3.0-preview.10` covers every 15.x, so there was no patch release to step sideways onto |
| 2026-11-11 | **Vercel SSO Deployment Protection turned off** | It defaults to `all_except_custom_domains`, which means a researcher clicking the link is asked to log into *your* Vercel account; §10.4 says the deployment is public |
| 2026-11-11 | **§10.8 settled as the deployed site, not a repo URL or an email** | The repo §10.7 is blocked from creating does not exist; an email puts personal data in eighteen third parties' logs; the site is public, stable and account-neutral |
| 2026-11-11 | **The contact URL is the short `chaperone-cyan` alias, not the long per-account one** | The long Vercel URL embeds the account handle, and this string goes out on every single request — a contact address identifies the tool, never its operator |
| 2026-11-11 | **`verify-deeplinks.mjs`'s `github.com/TBD/chaperone` fallback replaced** | A placeholder that *looks* like a real contact address and resolves to a 404 is worse than an obvious `TBD`; it sends the one administrator who bothers to follow it nowhere |
| 2026-11-11 | **The `'TBD'` fallback in `lib/http.ts` is kept, not replaced with the live URL** | An unset variable means a misconfigured deployment. Hard-coding the URL would hide that; `verify:criteria` warns on `TBD`, and that warning is the check |
| 2026-11-11 | **`chaperone.vercel.app` rejected as the share link** | It answers 200 and serves someone else's app (`<title>React App</title>`). A reachable hostname is not the same as our hostname, and the difference is only visible if you look at the body |
| 2026-11-11 | **"Get rid of the Claude Code watermarks" verified by scan, not by assertion** | Source, `.vercel/`, dotfiles, built output, live HTML, every served JS bundle and the response headers each scanned for `claude\|anthropic\|generated with\|co-authored`: zero hits everywhere. `AGENTS.md` is written by `next dev` itself (`node_modules/next/dist/server/lib/generate-agent-files.js`), is not served by any route, and is regenerated if deleted |
| 2026-11-16 | **§5.9 added: a question is answered in the chat, not in a file** | Your instruction. A PDF/HTML/artifact for something you merely asked costs a round trip to open and buries a short answer in a container. §4's "an actual markdown file, not chat scroll-back" was a ruling about the **plan** — which must be durable and editable — and was never a ruling about answers |
| 2026-11-19 | **PheGenI added as a 21st deep link, gene-addressable, `access: 'open'`** | The dbGaP button discarded the researcher's gene and opened an application homepage. PheGenI is the open, per-gene view of what those controlled studies actually hold, `phs` accessions included — so the decision to apply can be made on evidence rather than on hope (§6.4a) |
| 2026-11-19 | **Added as a SECOND entry rather than repointing dbGaP** | `access` drives the UI's grouping. Repointing dbGaP would have filed an open page under "these need your own credentials", or lost the application route for whoever decides to apply. Two honest buttons beat one ambiguous one |
| 2026-11-19 | **PheGenI recorded `verifiedBy: 'browser'`, not `'fetch'`, after the fetch evidence was thrown out** | A scripted fetch returns 200/68 kB with the symbol present — and does the same for `ZZZZQQQQ`, because the page echoes the query into its own form. No `phs` accession appears in any fetched body; the tables are JS-filled. The passing check was measuring an echo, and would have gone green forever |
| 2026-11-21 | **§6.4a shipped to production and verified on the live site, not just at the CLI** | `vercel --prod` printed `read ETIMEDOUT` again — that is the CLI's status *poll* failing, not the build; `vercel ls` showed ● Ready / Production / 14s. The deploy was then confirmed the only way that counts: the live page's final URL and `<title>Chaperone</title>` with no SSO wall, `/api/resolve?q=SCN9A` serving 19 links including `phegeni` with the right href, and the rendered strip putting it in grid 0 (`deeplink open`) while dbGaP stays in grid 1 (`deeplink application`) under the credentials banner |
| 2026-11-21 | **Criterion 14 re-argued structurally, because the value-scan could not run** | There is no `.env.local` here, so grepping the build for secret values scans for nothing — vacuous, the exact trap §7.14 was rewritten to avoid in 2026-11-09, and a positive control confirmed that scan was blind. The decisive check is structural instead: **zero `NEXT_PUBLIC_` references in source**, so Next has nothing to inline; the only env vars read anywhere are `CHAPERONE_CONTACT_URL`, `NCBI_API_KEY` and `NODE_ENV`, all server-side; and none of the four key names appears in any live client chunk. Stated as a structural guarantee, not as a passed value-scan |
| 2026-11-19 | **UK Biobank and All of Us deliberately left as index links** | Showcase indexes phenotype fields, not genes, and echoes the query — linking it per-gene would repeat the WikiPathways mistake. The All of Us Data Browser is a client-rendered SPA serving an identical 2,327-byte shell for every path, so it needs a by-hand control first |
| 2026-11-21 | **All of Us half of the row above SUPERSEDED: the Data Browser is now a 22nd deep link, gene-addressable, `access: 'open'`** | The by-hand control was done. Allele frequencies over 535,680 short-read whole genomes in a deliberately ancestrally diverse cohort — the axis gnomAD is thinnest on, so it disagrees with the gnomAD panel informatively rather than duplicating it. Aggregate only; individual-level data stays in the controlled Workbench (§6.4a) |
| 2026-11-21 | **The `/variants/{gene}` path assumed on 2026-11-19 was a guess and was WRONG** | It returns the SPA shell and nothing else, which to a script is indistinguishable from a working page — writing it in would have shipped a button that silently went nowhere. The real scheme, `/snvsindels/{symbol}`, was found only by driving the UI and watching where it went. Second time in three days that a plausible-looking URL survived a status-code check and died under a real one |
| 2026-11-21 | **The two new links' notes are worded differently on purpose** | An empty PheGenI result is ambiguous until you read its `Genes` row, because a real gene can genuinely have no catalogued association. An empty All of Us result is not: every real gene carries variation across half a million genomes, so 0 means the symbol is not a gene. Same §5.4 distinction, opposite default reading, so one shared wording would have been wrong for one of them |
| 2026-11-21 | **UK Biobank still left as an index link** | Unchanged and deliberate. The honest per-gene route for UKB exome results is Genebass — third-party, client-rendered, redirects host — which deserves its own decision rather than being smuggled in under a UK Biobank label |
| 2026-11-26 | **§10.7 closed with the Command Line Tools git, not the Xcode licence** | The block was a misdiagnosis that stood for three weeks: `git` was taken to mean `/usr/bin/git`, the Xcode stub. `/Library/Developer/CommandLineTools/usr/bin/git` was installed the whole time and needs no licence and no `sudo`. "A tool is broken" deserved the same treatment as a plausible URL — check which binary actually answers, not which name you typed |
| 2026-11-26 | **The repo is PUBLIC, overriding the private default that was offered** | Your call. Published only after a scan of every tracked file for keys, emails and local paths found none, and `.env.example`'s one populated value is the already-public contact URL — public is effectively irreversible once forks and caches exist, so the scan came first |
| 2026-11-26 | **The project folder moved out of `~/Desktop/APRAZAR` to `~/Desktop/chaperone`** | Your instruction: Chaperone is to be kept clear of unrelated work. The Vercel link survives because `.vercel/project.json` identifies the project by ID, not by path |
| 2026-11-26 | **The README's "M1 of 7" status was stale by seven milestones and is now generated from this table** | It was written at M1 and never updated, so it advertised a scaffold for a deployed 18-source app — and a reader, me included, believed it over this document. §5.8's documentation duty covers the README too, not just the plan |
| 2026-11-26 | **§11.10 the database inventory is a fourth tab, generated from the two lists** | Your request. Typing forty names into a component would have produced the same page today and a false one within a milestone — the registry already is the inventory, so the catalogue reads it rather than restating it (§9.3) |
| 2026-11-26 | **Queried and linked sources are listed under separate headings, never merged** | "All the databases that have been used" has two honest answers — 18 called, 22 linked — and one list of 40 would claim the tool reads sources it only points at. §5.5 applies to claims about Chaperone itself, not only about biology |
| 2026-11-26 | **A linked resource's row shows its origin, derived from a probe-built URL** | A `DeepLink` carries no homepage, only a builder needing identifiers. Scheme and host are facts about the resource; the probe identifiers are discarded and never rendered, so §6.5 is intact — but the component states this at the point it happens, because the same shortcut printing a full URL would be a fabricated record link |

### M2 findings — four fixes, three of them correctness

**1. PDB entity order is not biological order.** `6J8G` resolved to SCN2B, the
beta-2 subunit, because it is entity 1. The protein the structure is actually about
is the Nav1.7 alpha subunit, which was sitting in the "also present" list. Entities
are now sorted longest-chain-first: in a receptor-plus-accessory complex the long
chain is the subject. `6J8G` now resolves to SCN9A (2031 aa) with the two beta
subunits listed. A heuristic, labelled as one, with the alternatives kept visible.

**2. Guessing an id's type failed open.** ChEMBL ids do not say whether they name a
molecule or a target, so the first design probed `/target/{id}` and fell back to
`/molecule/{id}`. Measured, ChEMBL takes **10.3s to return a 404** from the target
endpoint — and when that probe timed out, the fallback concluded "not a target" and
gave a wrong answer for an id that was one. Replaced with `chembl_id_lookup`, which
names the entity type in a single call. A guess that fails open is worse than a
question.

**3. Retrying a timeout doubles the worst case.** `fetchJson` retried every network
failure including timeouts, so a 4s budget became 8s. A timeout is not a transient
blip — it is the source saying it is slower than the budget. Genuine connection
failures are still retried once; timeouts now fail immediately.

**4. ChEMBL needs its own budget.** It is the slowest source in the inventory and the
most variable: the same endpoint returned in 4.4s, 6.8s, 414ms and over 12s across
runs. It gets 20s where every other source gets 8–10s, and `only=` trims the aspirin
record from 11.5 KB to 113 bytes.

### M3 findings — four fixes, two of them honesty bugs

Nine panels now answer for a gene. The code typechecked and every panel returned
`data` on the first run — and three of the four problems below were still there,
invisible to that result. This is the milestone that justifies §14.1: a green probe
says the plumbing works, not that the answers are true.

**1. STRING's `limit` was being printed as a finding.** `/network` returns the
subnetwork among a protein's nearest neighbours, which includes edges *between*
neighbours. On SCN9A: 15 edges, only 4 touching SCN9A. Worse, "Direct partners: 20"
was simply the `limit` we had asked for, dressed up as a fact about the gene — ask
for 20, get 20, print 20. The count is gone; the panel now labels the figure as the
*n* highest-confidence neighbours requested, and reports neighbour-to-neighbour
edges separately as what they are.

I had also reported a STRING mis-resolution (SCN9A→SCN3A) during this milestone.
That was my error, not STRING's: `limit=3` had clipped the SCN9A edges out of a
neighbourhood subnetwork. Recorded because the false alarm came from the same
misreading of the endpoint as the real bug.

**2. IntAct symbol search crosses species, and the documented filters do not
work.** `findInteractions/SCN9A` returns *mouse* records (`scn9a_mouse`,
`hdac4_mouse`), and `speciesAFilter`/`speciesBFilter` did not remove them. Now
queried by UniProt accession, which is species-specific by construction. The
partners can still be non-human — SCN9A returns an HPV E5 protein, which is real
curated data — so the panel says so rather than letting it read as a human
interactome.

**3. Every M3 connector fabricated its own provenance.** All eight hard-coded
`cached: false` and `fetchedAt: new Date().toISOString()`, so an hour-old cached
response was displayed with the current timestamp beside it — a direct breach of
§5.4. Fixed with `FetchMeta` in `lib/http.ts`: it accumulates across the several
calls a panel may make, reporting `cached` only if *every* call was a hit and the
timestamp of the *oldest* contributing response. A panel is as stale as its
stalest part.

**4. Two clock reads made time run backwards.** With `FetchMeta` in place, IntAct's
timestamp still moved 1ms *earlier* between a cold and a warm read. Cause:
`cache.set()` read `Date.now()` to store the entry, and `fetchJson` read the clock
*again* for the response — two different instants for one event. `cache.set()` now
returns the instant it recorded and `fetchJson` reports that. One millisecond is
harmless; two sources of truth for "when was this fetched" is not.

**Verified.** `npx tsc --noEmit` clean. Cold probe, 13 subjects, all checks passed,
no symbol mismatches. Provenance tested explicitly across the cold→warm boundary on
six panels: all report `cached: false` with real latency when fresh, `cached: true`
with an **unchanged** timestamp when served from cache.

**A process note worth keeping.** I tried to apply fix 3 to all eight files with a
regex script. It reported success on every file and left all eight syntactically
invalid — it appended the closing parens at end-of-file instead of closing each
call, and put `meta` out of scope in ClinVar's module-level helper. Mechanical edits
across many files get a typecheck before they are believed, not after they are
reported.

### M4 findings — six fixes, and two sources that had changed under us

Sixteen panels now answer for a gene. **Two of the seven endpoints §6.1 recorded
as verified no longer worked as documented**, and neither failed loudly — both
returned HTTP 200 with a plausible body. Gate 1 was run on 2026-11-04; this is
one day of drift.

**1. GTEx: two endpoints, two defaults, 200 + `data: []`.**
`reference/gene` defaults to GENCODE **v26** (`ENSG00000169432.14`), while
`expression/medianGeneExpression` now defaults to dataset **gtex_v10**, built on
GENCODE **v39** (`…432.19`). So the id GTEx itself gave us was queried against a
dataset that had never heard of it, and the answer was an empty array with a 200
beside it — which renders as "GTEx has no expression data for this gene". SCN9A
has 54 tissues.

This is §6.5's hardcoded-identifier failure in new clothing: the id was properly
derived, but the *release it belonged to* was assumed. Both halves are now pinned
in `lib/gtex-dataset.ts`, and an incoming version suffix is stripped before
querying (`…432.14` + `gencodeVersion=v39` also returns empty). The connector
additionally treats an empty result as `unavailable`, not `empty`, with the
reason — because for an id derived from GTEx's own gene record, empty cannot be a
biological fact, only a drift between the two halves.

**2. GWAS Catalog: the documented filter is silently ignored.**
`?gene_name=` is the parameter §6.1 recorded. Measured:

| query | associations returned |
|---|---|
| `?gene_name=SCN9A` | 1,205,644 |
| `?gene_name=COMT` | 1,205,644, byte-identical |
| `?gene_name=ZZZZQQQQ` | 1,205,644, byte-identical |
| no filter at all | 1,205,644, byte-identical |
| `?mapped_gene=SCN9A` | **8** |
| `?mapped_gene=ZZZZQQQQ` | **0** |

`gene_name` returns the entire catalogue, with a 200. A connector built on it
would have shown the same arbitrary rows — "fetal hemoglobin measurement" — under
every gene a researcher ever searched, and looked healthy doing it. This is the
WikiPathways failure (§6.3) inside a source we had already verified.

`mapped_gene` is the working parameter. Since a filter here is demonstrably
capable of silently not filtering, the connector **verifies the filter's work**:
every row must carry the queried symbol in its own `mapped_genes`, rows that fail
are discarded and counted, and all rows failing is reported as `unavailable` with
the diagnosis rather than as an absence of associations.

**3. p-values underflow to zero, breaking display and ranking.**
6 of COMT's 50 associations carry `p_value: 0`. Their true values are 3e-1416,
4e-1820, 1e-2112, 5e-2335, 7e-2054 and 4e-3035 — all rs4680, the Val158Met
variant. Anything below ~5e-324 is 0.0 in a double, so `p_value` is lossy
*precisely for the strongest results in the catalogue*. The panel printed
"p = 0", which is not a p-value, and sorted by that float, tying the six most
significant rows at the front in arbitrary order. `pvalue_mantissa` and
`pvalue_exponent` are integers that carry the real value and are now
authoritative for both ordering and display.

**4. Monarch: the right source, the wrong question.**
Querying only `GeneToPhenotypicFeatureAssociation` reported "no phenotype
association for COMT" — while Monarch held **292** associations for COMT,
including 22q11.2 deletion syndrome. The category was simply too narrow, and the
panel published our narrow query as the source's verdict. Now queries three
categories in one request (Monarch accepts the parameter repeated) and keeps
**causal** separate from **correlated**: "this gene causes this disease" and
"variants here are correlated with it" are different claims, and a disease
asserted causal is not repeated under the weaker heading.

**5. HPO's entry count is not a disease count.**
SCN9A returns 9 disease entries that are 7 distinct diseases: *Paroxysmal extreme
pain disorder* appears as both OMIM:167400 and ORPHA:46348, and *Primary
erythromelalgia* / *Erythermalgia, primary* are both MONDO:0007571. Reporting 9
inflates it. Entries are grouped by MONDO id, every source id stays visible on
the surviving row, and the merge is stated.

**6. An absence was being presented as freshly confirmed.**
`app/api/panel/route.ts` hardcoded `fetchedAt: now, cached: false` on **every**
error path — the same §5.4 fabrication removed from the connectors in M3, still
alive in the route. So an `empty` panel always claimed its absence had just been
verified, even when the underlying 404 came from cache. "This source has nothing"
is a finding and carries the same freshness question as a value.

Fixed in three parts: `NoEntry` and `Unavailable` can now carry `Provenance`;
`fetchJson` caches an `emptyOn` response behind a marker (so a cache hit still
raises `NoEntry` rather than returning a fake record) and attaches its
provenance; and `FetchMeta.provenance()` lets a connector that fetched
successfully and then found nothing useful report the response's timestamp
instead of "now". A 5xx or timeout is still deliberately **not** cached — storing
it would turn one bad minute at a source into an hour of false failure.

Side benefit: a known-absent record no longer re-hits the source on every lookup,
which §5.3 asks of us anyway.

**7. The verification script could not have caught any of this — and carried the
bug it was written about.**
`scripts/verify-sources.mjs` asked only "did a 200 come back with the expected
field?", which no ignored filter will ever fail. Three changes:

- **Negative controls.** Where an endpoint filters, the script now also asks it
  for `ZZZZQQQQ` and requires a different, smaller answer. The GWAS check now
  reports `8 associations, 5/5 rows name SCN9A · control(ZZZZQQQQ)=0`. Run
  against the old `gene_name` parameter this fails loudly.
- **Assertions about identity, not presence.** The Monarch check required only
  that *a* record returned; it now requires the record to *be* SCN9A. And the
  script's own `HGNC` constant read **`HGNC:10596`** — the exact transposition
  §6.5 was written about, sitting inside the instrument meant to catch it,
  passing happily because Monarch answers for SCN8A with a 200. Corrected to
  10597.
- **Separate budgets for control requests.** Sharing one clock made a slow but
  healthy source fail as a timeout, i.e. the check reporting on itself.

The User-Agent and STRING `caller_identity` also still said "GeneLens", the
pre-rename name (§10.2).

Re-run: **25/29 pass.** The four failures are all expected and documented —
`ensembl` timed out past 30s again, re-confirming §6.5's reason for keeping it
off the critical path, and `gxa`, `wikipathways-old` and `pharmgkb` are §6.3
drops kept in the script as tripwires in case they return.

**Verified.** `npx tsc --noEmit` clean. Cold probe, 13 subjects, 16 panels, all
checks passed, no symbol mismatches. Provenance tested explicitly across the
cold→warm boundary on `data` **and** `empty` panels: all report `cached: false`
with real latency when fresh, `cached: true` with an unchanged timestamp when
served from cache. Content read rather than trusted — SCN9A returns
erythromelalgia, PEPD, CIP and HSAN2 with Nerve Tibial as top GTEx tissue; COMT
returns rs4680 and 22q11.2 deletion syndrome.

### M5 findings — the milestone turned on reading §11.6 properly

**The scope question came first, and it changed the design.** Every connector so
far takes a human gene. Neither BV-BRC nor NCBI Virus can answer anything about
one — they hold pathogen genomes. Built on the obvious assumption, both panels
would have been permanently empty.

§11.6 already had the answer: these two are *"for organism identification and
context"*. Their subject is an **organism**, which is also why free text had
produced no panels at all until now. So M5 is mostly resolver work.

**1. Free text is resolved as a trait AND an organism, not one or the other.**
`detect.ts` already described `text` as "a disease, trait or organism", and
nothing in the string says which. Both are now attempted via
`Promise.allSettled`, independently, so neither failing suppresses the other.
They discriminate cleanly, which is what makes this safe:

| query | NCBI Taxonomy | Open Targets |
|---|---|---|
| `neuropathic pain` | 0 hits | EFO trait ✅ |
| `influenza A virus` | taxid 11320 ✅ | no trait |
| `SARS-CoV-2` | taxid 2697049 ✅ | MONDO_0100096 (COVID-19) ✅ |
| `ZZZZQQQQ` | 0 hits | no trait |

`SARS-CoV-2` legitimately matches **both** — the virus and the disease it
causes are different things, and a researcher may mean either. Both are kept and
the panel says so, rather than picking one silently (§5.5).

**2. The number this milestone exists to report is also its most misleading.**
SARS-CoV-2 returns **9,225,310** nucleotide sequences; Zika virus **3,424**. A
2700:1 ratio that records surveillance funding, not biology. Printed bare beside
an organism name it invites exactly the wrong reading, so the caveat *is* the
panel's main content, not decoration.

**3. I guessed a number inside that very caveat.** The note I first wrote read
"Zika ~22k". The measured figure is 3,424 — wrong by 6×, invented from memory,
sitting inside the warning against misreading numbers. Removed: the note now
states the principle and quotes **no** other organism's count, because a live
figure hardcoded into prose is a literal that will drift (§6.5 applies to
sentences, not just to identifiers).

**4. Two panels disagree 7000-fold about "complete genomes", on one screen.**
For influenza A: NCBI reports **56**, BV-BRC **391,854**. Neither is wrong —
NCBI's figure greps the sequence *title*, BV-BRC's reads a curated status field,
and a segmented genome is deposited per segment so is seldom titled "complete
genome" at all. An unexplained 7000× gap between two adjacent panels is worse
than either number alone, so each now names the other and explains the
difference.

**5. Host counts are asked for, never sampled.** "How many of these genomes come
from a human host" is the one datum here that speaks directly to host-directed
work. Two shortcuts were tried and rejected: faceting `host_name` returns HTTP
400 from Solr, and sampling rows is meaningless — the first 200 influenza A
genomes *all* have an empty `host_name` while SARS-CoV-2's first rows read "Homo
sapiens". Tallying the first N rows would have produced a fabricated finding.
Each figure is instead its own server-side `numFound` over the whole collection,
and is labelled a floor rather than a proportion, because the remainder is
mostly genomes with *no* host annotation rather than genomes from other hosts.

`http_accept=application/solr+json` is required: the default encoding returns
the total only in a `Content-Range` **header**, which `fetchJson` does not
expose by design.

**6. NCBI field qualifiers must be percent-encoded.** A raw `txid2697049[Organism]`
came back as a non-JSON body, which `fetchJson` honestly but confusingly reports
as "response was not JSON" for what is really a malformed URL.

**Verified.** `npx tsc --noEmit` clean. Cold probe extended to **15 subjects**
including `SARS-CoV-2` and `Zika virus`, all checks passed across 18 panels.
Content read, not trusted: SARS-CoV-2 → 9,424,005 BV-BRC genomes, 97.8% annotated
*Homo sapiens*; Zika → 3,427 genomes, 50.7% human; influenza A → 1,432,057, 57.3%
human. `neuropathic pain` correctly resolves to a trait with **no** organism and
no pathogen panels.

**Three public APIs wobbled inside ten minutes** during this milestone: Reactome
429, GWAS Catalog HTTP 500 (twice), Monarch HTTP 502 (four consecutive) and one
Monarch timeout. All recovered within minutes and every panel reported
`unavailable` correctly. Nothing needed fixing — but it is the clearest argument
yet that §5.4's four states are load-bearing rather than fastidious, and that
`unavailable` will be a routine sight in production, not an exceptional one.

### M4 re-verification — 2026-11-06

Re-run a day later, on your instruction, because two M4 endpoints had changed
within 24 hours and that made the inventory worth distrusting.

**Nothing had drifted. Three things were learned anyway.**

- **Gate 1: 26/29 pass** (was 25/29). The three failures are the §6.3 drops —
  `gxa`, `wikipathways-old`, `pharmgkb` — unchanged. All five M4-specific checks
  hold: GTEx's pinned pairing still returns `ENSG00000169432.19` and 54 tissues
  in `gtex_v10`; the GWAS negative control still reads
  `8 associations, 5/5 rows name SCN9A · control(ZZZZQQQQ)=0`; Monarch still
  resolves `HGNC:10597 = SCN9A`.
- **Ensembl passed all three checks** (3.8s / 8.9s / 1.4s) having timed out and
  500'd the day before. This does not reinstate it — it is the §6.5 argument
  restated: a source that works today and fails tomorrow cannot be on the
  critical path. It stays off.
- **Provenance re-verified** across the cold→warm boundary on 14 panel loads
  spanning `data` and `empty` states: every one reports `cached: false` with
  real latency when fresh and `cached: true` with an unchanged timestamp when
  served from cache.

**The GWAS budget set yesterday was wrong, and the re-run caught it.**
It timed out on COMT at 25s. Re-measuring 3 page sizes × 3 runs showed
8.0–37.9s with page size making no difference (size=10 produced the *worst*
single time, 37.9s), so 25s had been set mid-distribution — the worst possible
place, failing about half the time. Raised to 45s; subsequent cold runs returned
in 21.8s, 27.6s, 17.9s and 23.2s, the first two of which 25s would have lost.
Yesterday's "7.5–17.0s" was simply too small a sample.

**A new rate limit surfaced: Reactome 429.** Two subjects got HTTP 429 after
several probe runs in quick succession. Self-inflicted by the verification
cadence rather than a defect — Reactome recovers within seconds and ten rapid
requests afterwards all returned 200 — but it advertises no `RateLimit` or
`Retry-After` header, and Chaperone has no outbound throttle. Recorded against
§11.7, which now has evidence instead of only a worry. The panels reported
`unavailable`, which is correct.

### M6 findings — the rules layer, and a check that cried wolf

Built: `lib/presets.ts`, `lib/deeplinks.ts` (20 links), `lib/signals.ts`, `lib/suggest.ts`,
`app/api/suggest/route.ts`, `scripts/verify-deeplinks.mjs`, plus rule assertions in the probe.
No interface work (§14.2). All 15 probe subjects and 18 panels pass.

**1. Four deep links were wrong, and the check that found them was wrong about five more.**
The first run of `verify-deeplinks.mjs` reported nine failures. Four were real:

| Link | What had happened |
|---|---|
| Human Pain Genetics DB | `humanpaingeneticsdb.mcgill.ca` is **NXDOMAIN** — not moved, gone. Now `humanpaingenetics.ca/resources/`. This was a §11.5 pain resource. |
| FinnGen PheWeb | Now redirects to **Google OAuth**. It was listed as open access; it is `credentialed`. |
| UK Biobank | `/enable-your-research/apply-for-access` redirects to `/use-our-data/apply-for-access/`. |
| PharmGKB | Redirects to **clinpgx.org** — PharmGKB has been folded into ClinPGx. |

The other five were the check misreading its own blind spots, and that is the more useful
finding. SCHEMA and BipEx serve a **1 kB app shell** to a script — and, measured with a
negative control, **the identical shell for a nonsense gene id**, so the 200 proved nothing
either way. DECIPHER answers a script with **HTTP 500** and a browser with the full record.
Expression Atlas answers a script with **nothing at all for 90 s** and a browser in about
one. OMIM returns a Cloudflare bot challenge to anything automated.

Checked by hand in the browser with nonsense-id controls: all five are correct. SCHEMA
renders SCN9A and answers "Gene not found" for the control.

So a non-200 from those hosts is evidence about their bot policy, not about the link. Each
entry now declares `verifiedBy`, and the script fails only what it can actually judge —
DNS failure, 404/410, or a `fetch`-verified link that stops naming its subject. Everything
else is reported and not failed. **A check that cries wolf gets ignored, which is how a
genuinely dead link would survive.** 8 of 20 links cannot be machine-checked; the script
prints that count every run so it cannot quietly become most of the table.

**2. The rules suggested a real gene that Chaperone cannot open.**
dbSNP maps rs1333049 to `CDKN2B-AS1` and rs6746030 to `SCN1A-AS1`. Both are real, correctly
reported, and neither resolves here — the resolver's spine is UniProt (§6.5), which carries
reviewed protein-coding entries, and an antisense RNA gene has no protein record. Criterion
17 broken by a gene that genuinely exists.

`/api/suggest` now resolves each suggested query before offering it, and the §5.4 split
decides the outcome: `NoEntry` withholds it and reports it in `dropped`, so the gap is
visible rather than quietly missing; `Unavailable` keeps it, because dropping a suggestion
over someone else's 503 would turn a transient failure into a permanent hole. 9p21 is a
real locus, and a researcher who wanted ANRIL should be told we cannot follow it.

**3. The rule suggested the gene already on screen.** For rs6746030 the resolver resolves
to SCN9A, and `variant-to-gene` then offered SCN9A — the subject being looked at. Fixed.

**4. The anti-fabrication check the probe can do from outside.** `suggest.ts` forbids
deriving a symbol: §8 invites "surfaces its paralogues", and the cheap way to do that is to
strip the digits off SCN9A and offer SCN1A–SCN11A. That is a generated biological claim
dressed as navigation — a naming convention is not paralogy, and it is the exact shape of
the §6.5 failure that returned SCN8A for SCN9A. So every suggested symbol must be one a
source named, and the probe now asserts it from outside the code: **a suggested query must
appear somewhere in the panel payloads that subject returned.** An invented symbol appears
in none. Paralogues are reached through links to real family pages instead.

**5. `signals.ts` is deliberately fragile in one direction.** Panels are formatted for a
reader; rules need numbers and symbols. Every extractor fails closed: a changed label means
the signal is absent and the rule does not fire. Fail-closed plus no test equals a rules
layer that quietly does nothing, so the probe asserts named rules **must** fire for known
subjects (`expect.rules`). Monarch needed its own branch — it renders disease names as the
*value* of a fixed label while Open Targets, GWAS Catalog and HPO render them as labels, and
treating it like the others returned "Causal for" as a disease name.

**6. §8 promised more than v1 can measure.** It says "a tolerant gene with many **viral**
interactions surfaces the antiviral host-factor view". There is no virus-host interaction
source in v1 — §11.6 scoped those out. The rule fires on constraint plus interaction count
and says exactly that, without claiming any partner is viral.

**7. A judgement to revisit at M8.** `tolerant-and-connected` fires for COMT and TRPV1,
offering the antiviral preset for genes a researcher is probably reading as psychiatric or
pain. The reasoning shown is accurate, but accurate noise is still noise. Worth watching
once the preset bar is visible and dismissible.

### M7 findings — two criteria were false, and one was testing nothing

Built `scripts/verify-criteria.mjs` (`npm run verify:criteria`), which checks the §7 criteria
M7 owns one at a time and prints a line each, so the result is reproducible rather than a
claim in prose. **11 criteria checked, 11 passing** — after four fixes.

**1. Criterion 4 was simply false.** "neuropathic pain resolves to a trait with associated
genes" — it resolved to `EFO_0005762` and stopped. No panel takes an EFO id, so a trait search
produced a name, no biology and no suggestions. The data was there and unasked for: Open
Targets' disease→targets direction returns **934 genes for neuropathic pain**, led by the
calcium-channel subunits — the gabapentinoid targets, which is the right answer. Added
`traitTargets()`, `ids.traitGenes`, and a `trait-to-gene` rule. "COVID-19" now suggests TYK2,
ACE2 and IFNAR2, which is what a researcher asking that question wants.

**2. Criterion 9 found a dead link in a panel — and could not actually have judged it.**
Three HPO record URLs returned 404. The scheme was right and the identifier was wrong: HPO
wants the CURIE, so `/browse/gene/6335` renders "Could not find requested entrez id 6335"
while `/browse/gene/NCBIGene:6335` renders the gene. Fixed.

But hpo.jax.org serves **HTTP 404 for every client-rendered route, the working ones included** —
both of those URLs are 404s. So the check did not distinguish them; it would have failed the
correct URL just as loudly, and only an eye could tell. That host is now exempted from the
status check, listed explicitly and re-checkable, rather than the exemption being silently
absorbed. Same lesson as M6's deep-link check, arriving by a different door.

**3. Criterion 10 was passing while testing nothing.** It named `rs6746030` in the GWAS
Catalog panel, but that rsID now resolves *through* dbSNP to SCN9A, so the panel queries by
symbol and correctly returns data. The 404-is-not-failure path was never touched. Reworded,
and now checked against **OR4F5** — an olfactory receptor nobody has studied, which returns a
genuine absence from six sources. The well-studied subjects return `data` everywhere, so
without a control like this the `empty` branch, which is what §5.4 exists for, is never
exercised at all.

**4. Criterion 14 would have passed without being a test.** "No API key appears in any client
bundle", verified by grepping the build — but no keys are configured, so the grep passed on
nothing. Rebuilt with canary values in `NCBI_API_KEY` and `OMIM_API_KEY`: absent from
`.next/static`, absent from the whole build, while a negative control (`Chaperone`) confirmed
the grep could find things. That is the test; the original was a tautology.

**5. Criterion 12 needed a counter, not a flag.** Every panel already reports `cached`, but
that is the cache layer reporting on itself — the thing under test. `lib/http.ts` now counts
outbound attempts at the single line where a request leaves the process, read via a dev-only
`/api/diag`. Measured: first pass 20 attempts, repeat pass **0**.

**6. Criterion 13 is now answered by the remote, not by our code.** `/api/diag?echo=1` sends
one real request through the ordinary `fetchJson` path and returns the headers the server saw:
`Chaperone/0.1.0 (+TBD)`. Reading `http.ts` shows intent; this shows arrival. It also makes
§10.8 visible on every run — the contact URL is still `TBD`.

**7. Criterion 8 verified by inducing a real failure.** Reactome's timeout was temporarily set
to 1 ms. It reported `unavailable` with "timed out after 1ms" while the other 15 panels
returned data, the resolution succeeded and the rules still fired. Reverted and confirmed
clean. The timeout also did not retry, which is the §5.3 rule working.

**8. The anti-fabrication check fired, correctly, on my own change.** After criterion 4's fix
the probe flagged ACE2, IFNAR2, AXL, CD8A and CD4 as "suggested but named by no source".
They were real Open Targets answers — but they arrive through the *resolver*, and the check's
haystack was panel payloads alone. Widening it was right; the instructive part is that adding
a feature silently widened the provenance surface, and the check noticed before I did. The
haystack lists source-returned fields explicitly rather than stringifying `ids`, because `ids`
also holds the user's own query text, and folding that in would let a suggestion launder the
input back as though a source had named it.

**9. A grep that could not fail.** Checking "no raw `fetch(` outside `lib/http.ts`" first ran
with a zsh glob that errored, so the `|| echo "none"` fallback printed a pass. Re-run properly
it found two — both in `app/page.tsx`, calling our own `/api/*` routes on relative paths,
which is the §9.1 architecture working. No third-party URL is fetched outside the wrapper.

### M8 findings — the interface, and three checks that judged what they could not see

Built 2026-11-07 → 09. `app/page.tsx` went from a 184-line provisional view doing three of
M8's six jobs to 96 lines of composition; all fetching moved to `components/useLookup.ts`,
and `components/Panel.tsx` was kept unchanged because it was already right.

**1. Criteria 11, 15, 16 and 17 are now machine-checked, and three of them read the SOURCE
rather than a browser page.** A browser check proves only that the one view I happened to
open behaved. Criterion 15 ("no field anywhere in the UI accepts a third-party credential")
scans every `.tsx` under `app/` and `components/` for input-bearing elements and credential-
shaped markup, and asserts the only field in the project is the search box. It is fail-closed:
finding *no* input anywhere fails, because the only honest reading of that is a broken scan.

**2. Criterion 16 could not be tested the obvious way, because the obvious test is a
tautology.** "Each preset filters without reordering" checked by applying `.filter()` and
asserting the order survived would always pass — `filter` preserves order by definition. The
real claim is that the grid uses a filter and not a sort, so it is checked structurally:
`PanelGrid` never receives the preset, so it has nothing to order by, and there is no
`.sort()` anywhere on the panel path. The membership half ("antiviral surfaces BV-BRC and
NCBI Nucleotide") is checked against live data.

**3. Criterion 10 was failing an upstream outage.** The GWAS Catalog v2 API began returning
HTTP 500 on every route mid-milestone — verified by hand to be theirs, not ours
(`associations?size=1` with no gene filter also 500d while the website served 200; it
recovered on 2026-11-09). Our connector reported `unavailable` with "HTTP 500", which is
exactly right, and the criterion failed it, because the check asserted `unavailable.length
=== 0` across the whole run. That is not the criterion's promise — it is a claim about
upstream uptime, which we neither control nor should assert. **Narrowed:** an `unavailable`
violates criterion 10 only when its message shows the source *answered* with an absence (404,
410, "not found"). Anything else — 5xx, timeout, refusal, DNS — is the source not answering,
and `unavailable` is the honest state. Both classes are printed, so an outage stays visible
instead of being quietly excused. **Proved it can still fail:** inducing
`Unavailable('HTTP 404 not found')` in the PDB connector made it FAIL with all five subjects
named; reverted, and the revert verified.

**4. Criterion 12 was penalising the cache for being correct.** A failed fetch is deliberately
not cached — caching one would pin an outage in place for the whole TTL and keep serving
`unavailable` after the source recovered. So a repeat query correctly retries whatever failed,
and the flat assertion "zero outbound requests on a repeat" fails whenever any source is down.
**Narrowed** to its actual promise: zero upstream requests *for every panel that succeeded*,
with the retry allowance tied to the count of panels that failed the first pass. It still
fails if a successful panel re-fetches.

**5. Criterion 9 called two live links dead.** It reported 404 for two IntAct record URLs;
`curl` and a fresh `node fetch` both returned 200 for the same URLs seconds later. The cause
is the run itself: UniProt, IntAct, HPO's release lookup, Expression Atlas and OLS4 all live
at `ebi.ac.uk`, and EBI sheds that load with a **404, not a 429**. A host that answers a
throttled request with "not found" is indistinguishable from a dead link on a single attempt.
**Fixed:** a 404 or 410 is now re-probed once after a pause, and only a link that fails twice
is called dead; recoveries are printed. This is the same lesson as the M6 deep-link check,
arriving at a different door — and it is evidence for §11.7, alongside the Reactome 429.

**6. Criterion 14's canary method was proving nothing, and the positive control caught it.**
Five canary secrets in `.env.local`, a production build, grep the client bundle: zero hits.
But the same grep over the *server* build also found zero — because Node reads these at
runtime and Next inlines only `NEXT_PUBLIC_*`. The canaries never enter any build artefact,
so "no canary in the bundle" was true whether or not a leak was possible. **Built a control
that actually leaks:** a `NEXT_PUBLIC_` canary rendered into an attribute of the search input.
First attempt still found nothing — the minifier had eliminated it as dead code — which is its
own small lesson about controls. Once it reached the DOM the grep found it in
`static/chunks/app/page-*.js`, and found **zero** of the five real secrets in that same
bundle. Criterion 14 passes, and now the check is known to be able to fail. Control and
`.env.local` removed; residue grep clean.

**7. Criterion 8b induced, with a genuine failure thrown in for free.** Three connectors'
timeouts set to 1 ms while GWAS Catalog was independently 500ing upstream: **4 of 15 panels
failed, 11 kept their data**, the resolved identity, all four preset chips and all 18 deep
links rendered, no error box, input and button enabled, and the suggestion rules still ran and
produced six suggestions. The page is usable with a quarter of its sources dead. Killing the
dev server outright was also tried: a lookup in flight fails into the error box with the page
still rendered and interactive, and a page already rendered keeps its content and controls.

**8. The suggestion block could not say "not yet".** Because the rules read the panels, they
cannot run until the slowest source answers — measured at ~20 s on SCN9A. For that whole time
the block was simply absent, which is indistinguishable from "the rules ran and found
nothing": the §5.4 mistake, moved from panels to suggestions. Added a `suggesting` flag,
cleared on every path out including the failures, and a dashed placeholder saying what it is
waiting for and that nothing appearing means no rule matched.

**9. The GWAS Catalog legacy REST API is now HTTP 410 Gone** (`/gwas/rest/api/…`, serving a
migration notice). Our connector was already on v2 and is unaffected. Recorded because the
v1 URL still appears in a lot of published documentation.

### Post-M8 findings — two additions you asked for, and two checks that had stopped covering the code

Both were requested after M8 closed, so they are recorded here rather than folded into it.
The detail is in §11.8 and §11.9; this is what the work *found*.

1. **A filter list is a promise, so every filter had to declare what it can actually do.**
   Of the 15 facets catalogued, only 5 can be applied by us. Three are restrictions
   already in force, and seven live at the source. Modelling that distinction was the
   whole design problem — a filter row that looks applicable and is not would be §5.4's
   failure in a new costume.
2. **GWAS Catalog silently discards a third parameter.** An invented `p_upper` returned
   the same 8 associations. Recorded as a deliberate refusal rather than shipped.
3. **Two self-inflicted bugs caught before shipping**, both of the same kind — a cached or
   computed value that would have been labelled with a filter it did not reflect. The PDB
   cache key now includes the method; ClinVar no longer prints a breakdown that is just
   the filter counting itself.
4. **The mmCIF and PDB parsers disagreed on 6J8E's resolution**, which turned out not to
   be a bug in either: cryo-EM and X-ray record resolution in different categories because
   they are different quantities. The interface now says which kind it is showing.
5. **Criterion 15 had stopped being the right check.** It enforced §7.15 by counting
   inputs, which works until a second legitimate input exists. Rewritten to check shape and
   an allowlist, with a positive control, and **criterion 15b** added to check the thing
   that actually makes a file input safe — that nothing supplied is transmitted.
6. **Criterion 16's no-reorder scan had stopped covering the code it judges.** §11.8 moved
   part of the panel-ordering logic into `useLookup.ts` and `FilterBrowser.tsx`; the scan
   still looked only at `page.tsx` and `PanelGrid.tsx`. Widened to all six files on that
   path, and proved able to fail by inducing a `.sort()` in the new one.

**Suites after this work:** `verify:criteria` **16/16**, typecheck clean. Criteria 15, 15b
and 16 were each induced to fail and then reverted; the structure parser was probed against
four real files with four negative controls, in Node and again in the browser.

### Deployment findings — 2026-11-11

You asked for it on Vercel, to share with real researchers for feedback, with the Claude
Code watermarks removed first. Four things stood in the way, none of them the application.

**1. Vercel refused to deploy at all.** "Vulnerable version of Next.js detected." Not a
warning — a hard block, with nothing to deploy past it. `npm audit` gave the advisory range
as `9.3.4-canary.0 – 16.3.0-preview.10`, which covers **every** 15.x release, so there was
no patch version to step sideways onto. Next went 15.1.6 → **16.4.6** and React 19.0.0 →
**19.3.1** — a major upgrade forced by a security gate rather than chosen. Typecheck clean,
build clean, `verify:criteria` **16/16** re-passed on the new major. A major version bump
this late deserves naming plainly: nothing in the suite regressed, but the suite is what it
is, and the first researcher to hit a Next 16 behaviour change will find it before we do.

**2. The watermark scan found nothing — which is a result only because it could have found
something.** `claude|anthropic|generated with|co-authored`, case-insensitive, over: all 74
project files, dotfiles and `.vercel/` included; the built output; the live HTML; every
`/_next/static/*.js` bundle the page loads; and the response headers. Zero hits in all five
places. One file deserved a second look rather than a reflex: **`AGENTS.md` is written by
`next dev` itself** — `node_modules/next/dist/server/lib/generate-agent-files.js`, which
exists and timestamps the file to today. It is Next 16's own output, no route serves it, and
deleting it only makes `next dev` write it again. It is not a watermark and it is not ours.

**3. The first deployment was behind a login wall, and "200 OK" hid it.** `curl` reported
`200` — and a final URL of `vercel.com/login`. Vercel's Deployment Protection defaults to
`ssoProtection: all_except_custom_domains`, so every researcher clicking the link would
have been asked to log into *your* Vercel account. Turned off, per §10.4. **The lesson is
about the instrument:** a status code alone cannot tell "the app answered" from "something
else answered instead", and every live check since has read the final URL and the response
*body*, not the code. That is what caught the fourth thing.

**4. `chaperone.vercel.app` is not ours.** It answers `200`, and it serves a different
application — `<title>React App</title>`. Had the link been passed to researchers on the
strength of a reachability check, they would have been sent to a stranger's site. Ours is
`chaperone-cyan.vercel.app`, the alias Vercel assigned, confirmed by `vercel inspect` to
point at the current production deployment and by its body to be Chaperone.

**Verified from outside, logged out, against the deployed site rather than local dev:**
reachable `200` with no redirect; `<title>Chaperone</title>` and all three tabs present;
`/api/resolve?q=SCN9A` → `Q15858`, `ENSG00000169432`, **15 panels**; `/api/filters` → 15
facets; `/api/diag` → **404**, sealed in production as §10.6 requires; zero watermarks in
the served page.

**Not verified, and worth saying so:** that the outbound User-Agent now carries the contact
URL. The variable is set for Production and the newest deployment was built after it was
set, and `userAgent()` reads `process.env` per request — but `/api/diag` is correctly
sealed, so there is no way to observe the header from outside. This is argued, not measured.

### Known limitations after M8

- **✅ RESOLVED 2026-11-10 — a throttled EBI request could render as a source's genuine
  "no entry".** Recorded at M8 as the one thing §5.4 exists to prevent, and left open
  because the trade-off was yours to make. You chose to fix it. **What was wrong:** ten
  connectors pass `emptyOn: [404]` — ChEMBL, AlphaFold, GWAS Catalog, IntAct, HPO, Monarch,
  Reactome, STRING, GTEx and HPA — and **four query `ebi.ac.uk` directly** (ChEMBL, GWAS
  Catalog, IntAct, and HPO's OLS4 release lookup), with AlphaFold on `alphafold.ebi.ac.uk`
  and UniProt adding traffic to the same estate. EBI sheds load with **404, not 429**, so a
  refusal arrived looking exactly like an answer, and the interface stated it as the source
  having no record for this gene. A researcher would have read a load problem of ours as a
  biological fact. **The fix (§11.7a):** `lib/http.ts` now asks once more, after 2.5 s,
  before concluding absence — and the three outcomes are distinguished. Asked twice and told
  the same thing twice is a finding. A second request that succeeds means the first was a
  refusal, and the researcher gets their data. A second request that fails differently means
  we established nothing, so the panel is `unavailable`, **not** `empty`: "we do not know" is
  a different answer from "there is nothing". **Cost:** one extra request and one 2.5 s pause
  per absent subject per TTL, because the confirmed result is cached either way. Panels are
  fetched in parallel, so the wall-clock cost of OR4F5's five genuine absences is one pause,
  not five. Proved by `npm run verify:absence` (criterion 10b) and proved able to fail.
- **Suggestions wait for the slowest panel.** ~20 s on a cold SCN9A. This is deliberate —
  running the rules early would mean a rule silently not firing because its panel had not
  landed, which is indistinguishable from a rule correctly not firing, and §8's discipline is
  fail-closed. The cost is disclosed in the interface rather than hidden.
- **The preset is sticky across searches.** Filter to Pain, search a new gene, and the filter
  is still on. The hidden-count note discloses it, but it is a surprise worth revisiting.
- **The preset lives in component state, not the URL**, so a filtered view cannot be shared or
  reloaded. §11.4 settled that this is built for you; a shareable view is a v2 concern.
- **No preset hides any panel for a human gene.** Only BV-BRC and NCBI Virus carry a preset
  tag, so for a gene subject every preset shows all 15 panels and only the deep-link strip
  narrows. Correct per §11.2 — a domain-neutral source survives every filter — but it means
  the filter looks inert on the most common query.
- **Criterion 8b was verified in dev, where Next serves its own error overlay.** None appeared,
  but the production build has no overlay at all, so this is the harsher of the two
  environments and the result carries over. Worth one re-check at M9 against the built app.

### Known limitations after M7

- **§10.8 is unresolved and now visible on every verification run.** The User-Agent reads
  `Chaperone/0.1.0 (+TBD)`. §5.3 makes identifying ourselves non-negotiable, and a contact of
  "TBD" half-honours it. Needs the repo URL.
- **Two licence obligations land on the interface, not the backend** (§5.6): HPO requires a
  stated acknowledgement and its logo; GTEx requires attribution with the access date and no
  implication of endorsement. Both are M8 work and neither is done.
- **Criterion 4's genes are one family deep.** All 12 returned for neuropathic pain are
  calcium-channel subunits, because that is how Open Targets ranks them. Faithful to the
  source, and a narrower view of the trait than a researcher might assume.
- **`/api/diag` is dev-only** and returns 404 in production. If it ever needs to work in a
  deployed environment, that gate has to be revisited deliberately.

### Known limitations after M6

- **The resolver cannot open a non-coding gene.** Its spine is UniProt (§6.5), which carries
  reviewed protein-coding entries, so `CDKN2B-AS1`, `SCN1A-AS1` and every other antisense or
  lncRNA gene a source names are unreachable. Suggestions for them are withheld and reported.
  Fixing it means resolving through NCBI Gene instead of UniProt — a v2 change to M2's work,
  not a patch here.
- **8 of 20 deep links cannot be machine-checked** (`verifiedBy: browser` or `blocked`). They
  are correct as of 2026-11-06, browser-checked with nonsense-id controls. A silent change at
  one of those hosts would not be caught by `npm run verify:deeplinks`.
- **Preset suggestions are keyword matches on trait names**, not ontology reasoning. They do
  not walk EFO or MONDO, so they will sometimes fire on a name that merely contains the word
  and miss a trait phrased differently. Every suggestion says so and names what it matched.
- **`tolerant-and-connected` is noisy**: it offers the antiviral preset for COMT and TRPV1.
  Accurate, and still probably not what that researcher wants. Revisit at M8.
- **Nothing is throttled** (§11.7, still open) and nothing is under version control (§10.7).

### Known limitations after M4

| Item | Milestone |
|---|---|
| **GWAS Catalog is the slowest source and the most variable: 8.0–37.9s.** Re-measured 2026-11-06 across 3 page sizes × 3 runs — page size does not help (size=10 gave the worst single time at 37.9s), so the cause is queueing at the source, not payload. The 25s budget set on 11-05 sat mid-distribution and failed ~half the time on COMT; **raised to 45s**, which is affordable only because panels load independently (§11.3) | accepted, re-measured |
| GWAS "strongest associations" are drawn from the first 50 rows, not all of them; the panel says so. Ranking across the full set would need pagination | v2 |
| HPO supplies no gene symbol, so that panel is outside the §7.6 cross-check. Its id comes from the same UniProt chain as `symbol`, so a check would largely be UniProt agreeing with itself | by design, documented |
| Monarch phenotype counts (61 for SCN9A) and HPO's (144) differ — different curation scopes, each honest within its own source. No attempt is made to reconcile them | by design |
| GTEx pins gtex_v10/v39. When GTEx moves its default again this needs one edit, and the connector's empty-result guard is what will say so | §5.2 re-run |
| DRG expression remains a deep link, not a connector (§11.5) | M6 |

### Known limitations after M3

| Item | Milestone |
|---|---|
| ChEMBL returns intermittent 500s and times out under repeated load. Panels correctly report `unavailable`, but it is the least reliable source in the inventory | accepted; §11.7 may help |
| STRING confidence scores include text-mining evidence, so a high score is not evidence of physical interaction. Noted in the panel, not filtered | by design |
| IntAct partner counts come from the first 50 records when more exist; the panel says so | accepted |
| gnomAD coordinate queries not yet exercised by the probe — no coordinate subject resolves to a gene | M4 |

### Known limitations after M2

| Item | Milestone |
|---|---|
| `rs1333049` maps to CDKN2B-AS1, a lncRNA with no reviewed UniProt entry, so no gene-level panels run. Correct behaviour, but it means non-coding loci get variant panels only | accepted |
| Variants mapping to several genes use the first; the others are named in a note but not queried | M8 could offer a chooser |
| Coordinate input resolves to no gene — no verified range-lookup source | M3 (gnomAD queries coordinates directly) |
| Cache is in-process, so it is per-server-instance | §11.7, before public launch |
| No unit tests. Verification is `npm run probe` against live APIs, which is the §14.1 instrument and catches more than unit tests would here | by design |

## 14. Milestones

**Backend first, interface last** (your decision, 2026-11-04). Every data source, the
resolver and the suggestion rules are finished and verified before the dashboard is
built. The interface is then written once, against a backend that is already known to
work, instead of being reworked at each milestone.

| # | Milestone | Contains | Status |
|---|---|---|---|
| M0 | Gate 1 | Section 6 verified against live endpoints | ✅ **done** |
| M1 | Skeleton | Scaffold, types, http wrapper, cache, registry, verify script, UniProt end to end | ✅ **done** |
| M2 | **Resolver + probe harness** | All input kinds (rsID via dbSNP, ENSG via GTEx, free text, PDB, ChEMBL, coordinate). `scripts/probe.mjs` — see 14.1. Criteria 1–6. | ✅ **done** |
| M3 | **Molecules & pathways** | gnomAD, ClinVar, PDB, AlphaFold, ChEMBL, Reactome, STRING, IntAct — 8 connectors | ✅ **done** |
| M4 | **Cell types & genetics** | GTEx, HPA, Open Targets, GWAS Catalog v2, Monarch, HPO, dbSNP — 7 connectors | ✅ **done** · re-verified 2026-11-06 |
| M5 | **Pathogen & antiviral** | BV-BRC, NCBI Virus — 2 connectors. Host-directed only per 11.6; no viral structures or direct-acting chemistry. | ✅ **done** |
| M6 | **Rules layer** | `presets.ts`, `deeplinks.ts` (20 links), `signals.ts`, `suggest.ts`, `/api/suggest`, `verify-deeplinks.mjs`. Sections 8 and 6.4. No UI — see 14.2. | ✅ **done** |
| M7 | **Backend verification** | `scripts/verify-criteria.mjs`. Criteria 1–7, **8 (not 8b)**, 9, 10, 12, 13, 14 + the 5.6 licence re-read. | ✅ **done** · 11/11 passing |
| M8 | **Interface** | The dashboard proper: search, panel grid, four states, preset bar, suggestions, deep-link strip, organism identity. Criteria 11, **8b**, **15**, 16, 17. **Plus the two licence obligations M7 surfaced:** the HPO acknowledgement statement and logo, and GTEx attribution with access date and no implied endorsement (§5.6). | ✅ **done** · 15/15 machine-checked passing; 8, 8b and 14 induced by hand |
| M8+ | **Two surfaces added after M8, at your request** | §11.8 the filter catalogue — 15 facets across 18 sources, in funnel order, click-to-scope, every applied filter probed first. §11.9 the structure door — drop a PDB or mmCIF file, read what it declares, never upload it. Criterion 15 rewritten, **15b** added. | ✅ **built** · 16/16 machine-checked passing · **your verification outstanding** |
| M8+ | **The EBI 404-as-empty risk, closed** | §11.7a — an absence is confirmed before it is reported. `lib/http.ts` + `scripts/verify-absence.mjs`, criterion **10b**. Was flagged at M8 as "the first thing M9 settles". | ✅ **done 2026-11-10** · 17/17, and proved able to fail |
| M9 | **Final verification & deploy** | Section 7 in full, then deployment. **Open for deploy:** §11.7's capacity half (no outbound throttle, no shared cache), §10.7 version control, §10.8 the contact URL, and the HPO logo obligation. | 🟡 **deployed 2026-11-11, public, verified logged out** at <https://chaperone-cyan.vercel.app> · §10.8 closed on the way · §10.7 git **closed 2026-11-26** · **§11.7 capacity and the HPO logo still open** · see §15 |

Each milestone ends with: does it run, what did I verify, what is still broken. In that order.

### 14.1 How backend milestones get verified without an interface

Backend-first removes "look at the page" as the way to tell whether something works,
so it has to be replaced with something better, not with nothing.

`scripts/probe.mjs`, built in M2, drives the HTTP API directly: for a list of test
subjects it calls `/api/resolve`, then every registered panel, and prints a table of
state, latency, cache hit, and the symbol each source believed it answered about. It
fails loudly on a cross-source symbol mismatch — the SCN8A/SCN9A class of error.

This is a better instrument than the eye: it checks all eighteen sources at once,
across several subjects, and it keeps working as a regression suite after M8.

### 14.2 The M1 page is frozen until M8 — audit of 2026-11-06

> **Lifted 2026-11-09 at M8, as planned.** `app/page.tsx` was replaced wholesale, not
> patched: 184 lines of provisional view became 96 lines of composition, and the three
> jobs it had been doing moved into `SearchBox`, `PanelGrid` and `ResolvedIdentity` —
> the last of which renders the organism identity the frozen page could not. The freeze
> did what it was for: the interface was written once, against a finished backend, and
> the staleness never had to be unpicked. `components/Panel.tsx` came through unchanged
> and is still in use, which is why it was frozen rather than deleted. The rest of this
> section is the reasoning as it stood, kept as the record.

You asked me to re-check that the milestones are aligned to backend-first. The table
above is correctly ordered: M0–M7 are backend, M8 is the interface, M9 deploys.
Nothing needed reordering.

**The code had drifted, though.** M1's "UniProt end to end" left a working interface
behind, and it has quietly been doing three of M8's six jobs ever since:

| M8 deliverable | Already written in M1 |
|---|---|
| search box | yes — `app/page.tsx`, with clickable examples |
| panel grid, grouped by layer | yes |
| four panel states | yes — `components/Panel.tsx`, incl. the criterion-6 mismatch warning |
| preset bar | no |
| suggestions | no |
| deep-link strip | no |

**And it is already stale**, which is the point. `grep -c "taxid\|organismName"
app/page.tsx` returns **0**: the page cannot display the organism identity M5 added,
because M5 happened after it. That is precisely the rework backend-first exists to
avoid, and it had already started happening.

**Decision (mine, 2026-11-06 — you expressed no preference, so I took the cheapest
reversible option):** the two files are **frozen**, not deleted and not extended.

- They are a **provisional debug view**, not the product. Nothing in section 7 is
  verified by looking at them.
- **No interface work happens before M8.** Not a field, not a label, not the organism
  identity they are missing. If M6–M7 make them look wrong, they stay wrong; the
  staleness is a true record of how far the backend has run ahead.
- `scripts/probe.mjs` remains the sole verification instrument for M6 and M7 (14.1).
- M8 replaces them wholesale rather than patching them, so the interface is still
  written once against a finished backend.

Deleting them was the stricter option and I did not take it: it would destroy 268
working lines to buy a purity the freeze already buys, and `app/page.tsx` is also the
only way to eyeball a panel by hand when the probe reports something strange.

### 14.3 How the rules layer gets verified without an interface

> **Extended at M8 (2026-11-09).** The interface-side criteria — 11, 15, 16 and 17 — joined
> `verify-criteria.mjs` rather than being checked by looking at the page, for the reason this
> section already argues: an eye checks the one view it happened to open. Three of the four
> read component *source* instead of a browser page, and each is fail-closed. The two that
> no script can stage — a partial failure and a production build — are induced by hand and
> written up in the M8 findings, with the positive control that makes each one mean something.

The rules (§8) are the hardest part of the backend to test, for two reasons that pull in
opposite directions.

They **fail closed**: `signals.ts` reads facts out of strings formatted for a human reader,
and if a connector relabels a fact the signal is simply absent and the rule does not fire.
That is the right failure — a suggestion built from a misparsed number would be a fabricated
finding (§5.5) — but a rules layer that silently stops working is worse than one that breaks
loudly. So `scripts/probe.mjs` carries `expect.rules` per subject: named rules that MUST
fire, so the silence is caught.

And they can **invent things**, which is the real risk. A suggestion is a claim about what to
look at next, and the cheap implementations are all fabrications: paralogues from a symbol's
digits, "viral interactions" from an interaction count, a gene the resolver cannot open. The
probe asserts four things from outside the code:

1. Every rule in `expect.rules` fired.
2. Every suggested query resolves — criterion 17, "link to a real next query".
3. **Every suggested symbol appears somewhere in the panel payloads that subject returned.**
   This is the anti-fabrication check: `suggest.ts` promises never to derive a symbol, and an
   invented one appears in no panel. It is checkable from outside precisely because it does
   not trust the code's own account of itself.
4. Nothing suggests the subject already on screen, and every rule gives a usable reason.

`npm run verify:deeplinks` covers the §6.4 strip separately, and what it can and cannot
decide is written into its own header — five of the twenty resources refuse automated
clients, so they are browser-checked by hand with nonsense-identifier controls.

`npm run verify:criteria` (M7) is the third instrument and the narrowest: the probe asks "does
everything still work", this asks "is each thing we promised actually true", one §7 criterion
per line. It is what caught criterion 4 being false, criterion 10 testing nothing, and
criterion 14 being a tautology. Three verification scripts sounds like two too many; they
answer different questions, and each one has now found something the others did not.

## 15. Live — what is true now, and what is still owed

**The link to share:** <https://chaperone-cyan.vercel.app>

Public, no login, verified logged out on 2026-11-11 (see *Deployment findings*). Running
Next 16.4.6 / React 19.3.1. The contact URL is set, so the eighteen APIs can see who is
calling them. Four things remain owed, in the order they will bite.

**15.1 §11.7's capacity half — open, and sharing makes it worse.** The correctness half is
closed: an absence is confirmed before it is reported (§11.7a). The capacity half is not.
There is **no outbound throttle and no shared cache**, and serverless makes that worse
rather than better: each Vercel instance holds its own in-memory cache, so the same query
from two researchers on two instances is two full fan-outs upstream. Every hit rate measured
in local development was measured against a single process and overstates what a shared
deployment will achieve. **A handful of reviewers is fine. A link forwarded around a
department is not** — the failure mode is not Chaperone falling over, it is eighteen public
APIs seeing unthrottled traffic from one User-Agent that now identifies us by name. The fix
is a shared cache (Vercel KV or equivalent) plus a per-source outbound limiter, and it
should land before the audience is wider than people you can name.

**15.2 Vercel plan vs §10.1 — needs your eyes, not mine.** §10.1 recorded at the outset
that **Vercel's Hobby plan permits non-commercial use only, so a public commercial
deployment needs Pro.** The project is commercial (§10.1, §10.5). The deployment is now
public. Whether it currently sits on Hobby or Pro is visible in your Vercel dashboard
billing page and is not something the CLI exposes, so this is flagged rather than answered.
Sharing a prototype with reviewers for feedback is a weaker case than operating
commercially, but the plan terms are yours to read and the obligation is live from today.

**15.3 §10.7 version control — CLOSED 2026-11-26.** The code is in git and pushed to
<https://github.com/discepolociliano-blip/chaperone>, public, branch `main`, one commit of
70 files. The three-week block was a misdiagnosis: the Xcode licence does block
`/usr/bin/git`, but `/Library/Developer/CommandLineTools/usr/bin/git` was installed all
along and needs neither the licence nor `sudo`. Nothing about the preparation had to change.
The folder also moved out of `~/Desktop/APRAZAR/chaperone` to `~/Desktop/chaperone` the same
day, to keep it clear of unrelated work; the Vercel link is by project ID and was unaffected.
**What this does not fix:** the deployed artefact still has no commit behind it, since the
first commit postdates the 2026-11-11 deploy — the history starts now, it is not
reconstructed. One thing was genuinely lost in the interval: the two Claude sessions that
built M1–M9 were deleted on 2026-11-25, so this document is now the only record of the
reasoning behind the code, which is what §5.8 existed to insure against.

**15.4 The HPO logo licence obligation — unmet.** Carried from M7 and now public, which is
when a display obligation actually attaches. The acknowledgement statement and version are
in place (§5.6); the logo is not.

**Also worth knowing:** Vercel serves `.vercel.app` deployments with `x-robots-tag: noindex`,
so the site will not appear in search results. That is right for a review link and is
something to change deliberately, not by accident, if it ever becomes a product.
