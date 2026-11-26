'use client';

// The panel set, grouped by biological layer, in one fixed order.
//
// The order comes from `LAYER_ORDER` in the registry, which is also what §9
// documents and what the §6 inventory is grouped by — so the dashboard, the
// plan and the registry cannot drift apart (§9.3). Adding a source changes one
// line in `registry.ts` and appears here with no change to this file.
//
// §11.3: EVERYTHING renders at once, including the panels that found nothing.
// Showing a source that came back empty is information — it says the question
// was asked and answered. Hiding absence behind an expander makes it look like
// it was never checked, which is the same confusion §5.4 exists to prevent.

import { Panel } from './Panel';
import { LAYER_LABEL, LAYER_ORDER } from '@/lib/registry';
import type { PanelResult, Layer } from '@/lib/types';
import type { PanelSpec } from './useLookup';

export interface PanelGridProps {
  specs: PanelSpec[];
  results: Record<string, PanelResult>;
  expectedSymbol?: string;
}

export function PanelGrid({ specs, results, expectedSymbol }: PanelGridProps) {
  const inLayer = (layer: Layer) => specs.filter((s) => s.layer === layer);

  return (
    <>
      {LAYER_ORDER.filter((l) => inLayer(l).length > 0).map((layer) => (
        <section key={layer}>
          <div className="layer-title">{LAYER_LABEL[layer]}</div>
          <div className="grid">
            {inLayer(layer).map((spec) => (
              <Panel
                key={spec.id}
                name={spec.name}
                source={spec.source}
                result={results[spec.id] ?? null}
                expectedSymbol={expectedSymbol}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
