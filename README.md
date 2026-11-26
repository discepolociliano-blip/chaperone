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
| `components/SourceCatalogue.tsx` | The Databases tab (§11.10) — the inventory, generated from the registry and the deep-link list. |
| `lib/connectors/` | One file per data source. Identifiers in, panel data out. |
| `lib/registry.ts` | The single list of connectors. Adding a source touches this plus one new file. |
| `components/` | Rendering only. No fetching. |
| `scripts/` | The endpoint verification harness. |

## Status

**Live at <https://chaperone-cyan.vercel.app>** — public, no login.

M0–M8 are done, plus the two surfaces added after M8 (the filter catalogue and
the structure door). M9 deployed on 2026-11-11. That means: 18 connectors, the
resolver, the rules layer (3 presets, 22 deep links, 10 suggestion rules), the
interface in three tabs, and all 20 §7 criteria met — 17 machine-checked by
`npm run verify:criteria` and `npm run verify:absence`, three induced by hand.

Two things are still owed, both in PROJECT-PLAN.md §15:

- **§15.1 no outbound throttle and no shared cache.** Each serverless instance
  caches separately, so the same query on two instances is two full fan-outs
  upstream. Fine for reviewers you can name; not fine for a link forwarded
  around a department.
- **§15.4 the HPO logo** display obligation is unmet (the acknowledgement
  statement and version are in place).

§15.2 — whether the Vercel plan permits a public commercial deployment — needs
the owner's eyes on the billing page, not a code change.

The milestone table and the full record of what was decided and why are in
PROJECT-PLAN.md §14 and §13. **Read it before changing anything here:** the
conversations that built this project were deleted on 2026-11-25, so that
document is the only remaining record of the reasoning.
