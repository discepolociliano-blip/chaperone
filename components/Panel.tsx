'use client';

// Renders one panel in any of the four states (PROJECT-PLAN.md §5.4) plus
// a loading state. No fetching here — components hold no fetch logic (§9.3).

import type { PanelResult } from '@/lib/types';

const STATE_LABEL: Record<PanelResult['state'], string> = {
  data: 'data',
  empty: 'no entry',
  unavailable: 'unavailable',
  unconfigured: 'not configured',
};

export interface PanelProps {
  name: string;
  source: string;
  result: PanelResult | null;
  /** The symbol the resolver settled on, for the cross-source check (§7.6). */
  expectedSymbol?: string;
}

export function Panel({ name, source, result, expectedSymbol }: PanelProps) {
  const state = result?.state;
  const mismatch =
    result?.symbolSeen &&
    expectedSymbol &&
    result.symbolSeen.toUpperCase() !== expectedSymbol.toUpperCase();

  return (
    <div className="panel">
      <header>
        <div>
          <h3>{name}</h3>
          <div className="src">{source}</div>
        </div>
        <span className={`badge ${state ?? 'loading'}`}>{state ? STATE_LABEL[state] : 'loading'}</span>
      </header>

      {/* §6.5: never render one gene's data under another's name silently. */}
      {mismatch && (
        <div className="mismatch">
          This source answered about <strong>{result?.symbolSeen}</strong>, but the query resolved to{' '}
          <strong>{expectedSymbol}</strong>. Treat these values with suspicion.
        </div>
      )}

      {!result && <div className="message">Querying {source}…</div>}

      {result?.state === 'data' &&
        result.facts?.map((f, i) => (
          <div className="fact" key={`${f.label}-${i}`}>
            <div className="label">{f.label}</div>
            <div className="value">
              {f.href ? (
                <a href={f.href} target="_blank" rel="noopener noreferrer">
                  {f.value}
                </a>
              ) : (
                f.value
              )}
            </div>
            {f.note && <div className="note">{f.note}</div>}
          </div>
        ))}

      {result && result.state !== 'data' && <div className="message">{result.message}</div>}

      {result && (
        <footer>
          <span>
            {result.cached ? 'cached · ' : ''}
            {new Date(result.fetchedAt).toLocaleTimeString()} · {result.ms} ms
          </span>
          {result.recordUrl && (
            <a href={result.recordUrl} target="_blank" rel="noopener noreferrer">
              source record ↗
            </a>
          )}
        </footer>
      )}
    </div>
  );
}
