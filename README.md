# Chaperone

One query surface over the public molecular biology APIs. Type a gene symbol, a
variant, or an accession once; read every source on one page.

**The plan, the rules and the data-source inventory live in [PROJECT-PLAN.md](PROJECT-PLAN.md).**
This file only covers how to run it.

## Requirements

Node 20 or newer. No database, no accounts, no API keys needed.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Optional API keys

Everything works without them. Copy the template and fill in only what you want:

```bash
cp .env.example .env.local
```

A missing key makes exactly one panel show "not configured" naming the variable.
Nothing else changes.

Keys here belong to the deployment, not to a user. Chaperone never accepts,
stores or forwards anyone's credentials for a third-party database — for
login-gated resources it links you to that database's own site
(PROJECT-PLAN.md §3.1).

## Check the upstream APIs

```bash
npm run verify:sources
```

Calls every endpoint in the inventory with a real query and prints pass/fail
with latency. Worth running when a panel misbehaves: these are third-party
services and they change. The GWAS Catalog retired its v1 API and PharmGKB's
API host stopped resolving, both caught by this script.

## Layout

| Path | What lives there |
|---|---|
| `app/api/` | Route handlers. The only code that talks to upstream APIs. |
| `lib/connectors/` | One file per data source. Identifiers in, panel data out. |
| `lib/registry.ts` | The single list of connectors. Adding a source touches this plus one new file. |
| `components/` | Rendering only. No fetching. |
| `scripts/` | The endpoint verification harness. |

## Status

M1 of 7. The scaffold, the four-state panel model, the resolver spine and the
UniProt connector are in place. Remaining milestones are listed in
PROJECT-PLAN.md §14.
