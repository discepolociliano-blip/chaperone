'use client';

// Every database Chaperone uses, in one list. PROJECT-PLAN.md §11.10.
//
// The question this answers is "what is actually behind this page?", and it is
// a fair one to ask of a tool whose whole claim is that it reads eighteen
// sources for you. Until now the answer was only visible by running a query
// and counting panels, which shows you the sources that happened to have
// something to say about that subject — not the inventory.
//
// GENERATED, NEVER TYPED. The rows come from `connectors` (lib/registry.ts)
// and `DEEP_LINKS` (lib/deeplinks.ts), the same two lists the dashboard reads,
// so this page cannot drift from what the app does. §9.3 made that the rule
// for the panel grid; a catalogue that falls out of date is worse than none,
// because it reads as a claim about the present. Every count below is computed
// for the same reason — a hardcoded "18 sources" survives the deletion of a
// connector.
//
// THE SPLIT IS THE POINT, and it is a distinction about honesty, not layout:
//
//   · QUERIED — Chaperone calls this source's API and renders what came back,
//     with the four states (§5.4) and a timestamp. If it is here, the data on
//     a panel came from it.
//   · LINKED — Chaperone builds a URL into this resource and nothing more. It
//     never calls it, never holds an answer from it, and for the credentialed
//     ones never sees a credential (§3.1). Listing these together with the
//     queried sources under one heading would be a quiet overstatement of what
//     the tool does, which is exactly the kind of claim §5.5 exists to stop.
//
// The origin shown for a linked resource is derived by building its URL and
// keeping only the scheme and host. §6.5 forbids identifier literals in URLs
// the researcher is given, and this does not breach it: the probe identifiers
// below are never rendered and never requested — they exist so the builder has
// something to build with, and everything after the host is discarded.

import { useMemo } from 'react';
import { connectors, LAYER_LABEL, LAYER_ORDER } from '@/lib/registry';
import { DEEP_LINKS, type Access, type DeepLink } from '@/lib/deeplinks';
import type { Identifiers, Layer } from '@/lib/types';

export interface SourceCatalogueProps {
  open: boolean;
  onClose: () => void;
}

/**
 * How many distinct databases the app can reach, for the tab badge.
 *
 * Derived from the two lists, like everything else here, so the number on the
 * tab is the number of rows behind it. A source that is both queried and
 * linked counts once.
 */
export const SOURCE_COUNT: number = new Set([
  ...connectors.map((c) => c.source.toLowerCase()),
  ...DEEP_LINKS.map((l) => l.name.toLowerCase()),
]).size;

/**
 * Enough identifiers that every link builder returns something, so the host
 * can be read off it. Values are arbitrary and never leave this module — see
 * the §6.5 note in the header.
 */
const PROBE: Identifiers = {
  query: '',
  kind: 'symbol',
  symbol: 'PROBE',
  uniprot: 'P00000',
  hgnc: 'HGNC:0',
  ncbiGene: '0',
  ensemblGene: 'ENSG00000000000',
  gencodeId: 'ENSG00000000000.1',
  rsid: 'rs0',
  efoId: 'EFO_0000000',
  taxid: '0',
  organismName: 'probe',
  pdbId: '0XXX',
  chemblId: 'CHEMBL0',
  coordinate: '1:1',
};

/** The resource's own site, or null when its URL cannot be built at all. */
function originOf(link: DeepLink): string | null {
  let built: string | undefined;
  try {
    built = link.url(PROBE);
  } catch {
    return null;
  }
  if (!built) return null;
  try {
    return new URL(built).origin;
  } catch {
    return null;
  }
}

/** Host without the www., for display. */
function hostLabel(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, '');
  } catch {
    return origin;
  }
}

const ACCESS_ORDER: Access[] = ['open', 'credentialed', 'application'];

const ACCESS_HEADING: Record<Access, string> = {
  open: 'Open — click and read',
  credentialed: 'Needs your own account at that resource',
  application: 'Controlled access — the link opens the application process',
};

const ACCESS_NOTE: Record<Access, string> = {
  open: 'No sign-in anywhere in this group.',
  credentialed:
    'You sign in at the resource itself. Chaperone never asks for, handles, forwards or stores a credential for any third-party database (§3.1).',
  application:
    'These hold data nobody can simply open. The link goes to the application route, so what is on offer is visible before the decision to apply.',
};

const LANDS_LABEL = {
  record: 'opens the record',
  'prefilled-search': 'opens a search already filled in',
  index: 'opens the resource, not addressable per gene',
} as const;

export function SourceCatalogue({ open, onClose }: SourceCatalogueProps) {
  const queried = useMemo(
    () =>
      LAYER_ORDER.map((layer: Layer) => ({
        layer,
        label: LAYER_LABEL[layer],
        rows: connectors.filter((c) => c.layer === layer),
      })).filter((g) => g.rows.length > 0),
    [],
  );

  const linked = useMemo(
    () =>
      ACCESS_ORDER.map((access) => ({
        access,
        rows: DEEP_LINKS.filter((l) => l.access === access),
      })).filter((g) => g.rows.length > 0),
    [],
  );

  if (!open) return null;

  return (
    <section className="catalogue" aria-label="The databases Chaperone uses">
      <div className="cat-head">
        <div className="layer-title">
          Databases · {SOURCE_COUNT}
          <span className="dim">
            {' '}
            — {connectors.length} queried through their APIs, {DEEP_LINKS.length} linked
          </span>
        </div>
        <button type="button" className="chip" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="cat-intro dim">
        Two different relationships, kept apart on purpose. A <strong>queried</strong> source is called by
        Chaperone and its answer is rendered as a panel, with the time it was fetched. A <strong>linked</strong>{' '}
        resource is one Chaperone only builds a URL into — it is never called, nothing from it is ever shown
        here, and no credential for it is ever handled by this tool.
      </p>

      <div className="cat-group-title">
        Queried through their APIs <span className="cat-n">{connectors.length}</span>
      </div>
      <p className="cat-note dim">
        Every panel on a result page comes from exactly one of these. Grouped in the researcher&apos;s funnel
        order, which is the order they appear on the page.
      </p>

      {queried.map((g) => (
        <div key={g.layer} className="cat-layer">
          <div className="cat-layer-title">{g.label}</div>
          <ul className="cat-list">
            {g.rows.map((c) => (
              <li key={c.id} className="cat-row">
                <span className="cat-name">{c.source}</span>
                <span className="cat-role">{c.name}</span>
                <a
                  className="cat-link"
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {hostLabel(c.sourceUrl)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="cat-group-title">
        Linked, never queried <span className="cat-n">{DEEP_LINKS.length}</span>
      </div>
      <p className="cat-note dim">
        These are resources whose API will not answer the question, will not take our query, or does not exist
        — so the honest thing is to hand you the right page rather than pretend to have read it. Each row says
        where the link lands.
      </p>

      {linked.map((g) => (
        <div key={g.access} className="cat-layer">
          <div className="cat-layer-title">
            {ACCESS_HEADING[g.access]} <span className="cat-n">{g.rows.length}</span>
          </div>
          <p className="cat-access-note dim">{ACCESS_NOTE[g.access]}</p>
          <ul className="cat-list">
            {g.rows.map((l) => {
              const origin = originOf(l);
              return (
                <li key={l.id} className="cat-row">
                  <span className="cat-name">{l.name}</span>
                  <span className="cat-role">
                    {l.source} · {LANDS_LABEL[l.lands]}
                  </span>
                  {origin ? (
                    <a className="cat-link" href={origin} target="_blank" rel="noopener noreferrer">
                      {hostLabel(origin)}
                    </a>
                  ) : (
                    <span className="cat-link dim">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="cat-foot dim">
        Chaperone is a navigational aid over these databases. It does not host, mirror or alter their data, and
        none of them endorses it. Where a panel shows a value, the panel links to the record it came from;
        verify there before relying on it.
      </p>
    </section>
  );
}
