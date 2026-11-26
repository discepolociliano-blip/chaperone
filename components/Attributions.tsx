'use client';

// Source attribution and the licence obligations M7 surfaced. §5.6.
//
// These are not courtesies. §5.6 makes licence compliance a filter rather than
// a footnote, because Chaperone is commercial (§10.1), and the 2026-11-06
// re-read found two sources imposing obligations on anything that DISPLAYS
// their data — which is what this interface does, and which is why they land
// here in M8 rather than in a connector.
//
//   HPO: "Users of the HPO should add the following statement to their online
//   presence. This service/product uses the Human Phenotype Ontology (version
//   information). Find out more at http://www.human-phenotype-ontology.org"
//   — plus the separate condition that any HPO content shown publicly include
//   its version. The version is read live out of the HPO panel, which gets it
//   from EBI OLS4 because HPO's own annotation API reports none.
//
//   GTEx: a redistributor must "acknowledge the GTEx Portal as the source"
//   with the access date, and must "not indicate or imply that the GTEx Portal
//   has endorsed" the product. The access date is the panel's own fetch
//   timestamp, so the acknowledgement is dated by what actually happened
//   rather than by a hardcoded string (§6.5 applies to prose too).
//
// Both are rendered only when that source actually contributed to what is on
// screen. An acknowledgement for data nobody was shown is noise, and a
// permanently-displayed version number for a panel that did not load would be
// a claim about data the researcher never saw.

import type { PanelResult } from '@/lib/types';

export interface AttributionsProps {
  results: Record<string, PanelResult>;
}

/** The release string the HPO panel reported, if that panel rendered. */
function hpoVersion(results: Record<string, PanelResult>): string | null {
  const p = results['hpo'];
  if (p?.state !== 'data') return null;
  const fact = p.facts?.find((f) => f.label === 'HPO release');
  return fact?.value && fact.value !== 'unknown' ? fact.value : null;
}

function accessDate(p: PanelResult | undefined): string | null {
  if (!p?.fetchedAt) return null;
  const d = new Date(p.fetchedAt);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function Attributions({ results }: AttributionsProps) {
  const hpo = results['hpo'];
  const hpoShown = hpo?.state === 'data';
  const version = hpoVersion(results);

  const gtex = results['gtex'];
  const gtexShown = gtex?.state === 'data';
  const gtexDate = accessDate(gtex);

  const anyPanel = Object.keys(results).length > 0;

  return (
    <footer className="legal">
      <p>
        Chaperone is a navigational aid over third-party databases. It is not a clinical or diagnostic tool.
        Every value links to the source record that produced it; verify against the source before relying on
        it.
      </p>

      <p>
        Chaperone never asks for, handles or stores credentials for any third-party database. Where a resource
        requires an account, you sign in at that resource.
      </p>

      {hpoShown && (
        <p className="attribution">
          This service uses the Human Phenotype Ontology
          {version ? ` (version ${version})` : ' (version not retrieved — treat HPO content above as of unknown vintage)'}.
          Find out more at{' '}
          <a href="http://www.human-phenotype-ontology.org" target="_blank" rel="noopener noreferrer">
            human-phenotype-ontology.org
          </a>
          . HPO content is reproduced unaltered.
        </p>
      )}

      {gtexShown && (
        <p className="attribution">
          Expression data on this page were obtained from the GTEx Portal
          {gtexDate ? ` on ${gtexDate}` : ''}. The GTEx Portal does not endorse Chaperone. Chaperone pins a
          GTEx release (named on the panel), so these figures are not necessarily the most current available
          from the GTEx Portal.
        </p>
      )}

      {anyPanel && (
        <p className="attribution dim">
          Data on this page is reproduced from its sources under their own licences, which include CC0, CC BY
          4.0 and CC BY-SA 3.0; each panel links to the record it came from. Chaperone displays source values
          and does not alter them. No source listed here endorses Chaperone.
        </p>
      )}
    </footer>
  );
}
