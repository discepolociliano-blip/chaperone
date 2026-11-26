'use client';

// Where to look next. PROJECT-PLAN.md §8 and criterion 17.
//
// Criterion 17 is "suggestions link to a real next query AND NAME THE RULE
// that produced them", and the second half is the part that matters. §8's
// promise is that this is rule-based navigation and not a model inferring
// biology: no claim about a gene's function is generated, every suggestion is
// a link to a query against a real source, and the researcher can see why it
// was offered and ignore it.
//
// A suggestion with its reasoning hidden would be indistinguishable from a
// guess. So the rule name and its `because` are rendered as part of the
// suggestion, not behind a tooltip — including the caveats the rules attach
// about what a score does and does not mean.
//
// `dropped` is rendered too. Those are suggestions the server withheld because
// the subject cannot be opened here — dbSNP names non-coding genes the
// UniProt-based resolver cannot follow. Saying "we found this and cannot go
// there" is more useful than silence, which would read as nothing being found.

import { PRESETS } from '@/lib/presets';
import type { Suggestion } from '@/lib/suggest';
import type { Preset } from '@/lib/types';
import type { DeepLinkInfo, DroppedSuggestion } from './useLookup';

export interface SuggestionsProps {
  suggestions: Suggestion[];
  dropped: DroppedSuggestion[];
  deepLinks: DeepLinkInfo[];
  /** True while the panels are still settling and the rules have not run. */
  suggesting: boolean;
  onQuery: (q: string) => void;
  onPreset: (p: Preset) => void;
}

export function Suggestions({
  suggestions,
  dropped,
  deepLinks,
  suggesting,
  onQuery,
  onPreset,
}: SuggestionsProps) {
  // Nothing found, and nothing still coming: say nothing. That is the honest
  // empty, and it is only reachable once `suggesting` has gone false.
  if (!suggestions.length && !dropped.length && !suggesting) return null;

  // Still working. Measured at ~20 s on SCN9A, because the rules read the
  // panels and the slowest source gates them. Without this the block is simply
  // absent, which reads as "the rules ran and found nothing" — the §5.4
  // mistake, applied to suggestions instead of panels.
  if (!suggestions.length && !dropped.length) {
    return (
      <section className="suggestions">
        <div className="layer-title">Where to look next</div>
        <div className="suggestion pending">
          <div className="because">
            Waiting for every panel to settle — the rules read what the sources returned, so they cannot run
            before the slowest one answers. If nothing appears here, no rule matched.
          </div>
        </div>
      </section>
    );
  }

  const hrefFor = (s: Suggestion): string | undefined => {
    if (s.kind === 'url') return s.href;
    if (s.kind === 'link') return deepLinks.find((l) => l.id === s.deepLinkId)?.href;
    return undefined;
  };

  return (
    <section className="suggestions">
      <div className="layer-title">Where to look next</div>
      <div className="suggestion-list">
        {suggestions.map((s, i) => {
          const href = hrefFor(s);
          const presetLabel =
            s.kind === 'preset' ? PRESETS.find((p) => p.id === s.preset)?.label ?? s.preset : null;

          return (
            <div className="suggestion" key={`${s.rule}-${i}`}>
              <div className="suggestion-head">
                {s.kind === 'query' && (
                  <button type="button" className="chip action" onClick={() => onQuery(s.query)}>
                    {s.label}
                  </button>
                )}
                {s.kind === 'preset' && (
                  <button type="button" className="chip action" onClick={() => onPreset(s.preset)}>
                    {s.label}
                  </button>
                )}
                {(s.kind === 'link' || s.kind === 'url') &&
                  (href ? (
                    <a className="chip action" href={href} target="_blank" rel="noopener noreferrer">
                      {s.label} ↗
                    </a>
                  ) : (
                    <span className="chip">{s.label}</span>
                  ))}

                {/* Criterion 17: the rule is shown, not hidden. */}
                <code className="rule-name">{s.rule}</code>
                {presetLabel && <span className="dim">filters to {presetLabel}</span>}
              </div>
              <div className="because">{s.because}</div>
            </div>
          );
        })}

        {dropped.map((d, i) => (
          <div className="suggestion withheld" key={`${d.rule}-dropped-${i}`}>
            <div className="suggestion-head">
              <span className="chip disabled">{d.query ?? 'withheld'}</span>
              <code className="rule-name">{d.rule}</code>
              <span className="dim">withheld</span>
            </div>
            <div className="because">
              {d.why ?? 'A source named this subject, but Chaperone cannot open it.'}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
