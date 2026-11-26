'use client';

// The search box, and the only input on the page.
//
// That is a design constraint, not an accident. §7.15 is "no field anywhere in
// the UI accepts a third-party credential", which enforces §3.1: Chaperone
// never handles anyone's database credentials, because holding them would be a
// security liability and would breach the data-use agreements of every
// controlled-access resource.
//
// The strongest way to satisfy that is to have nowhere to type one. This
// component renders a single text input, for a subject to look up. Where a
// resource needs an account, the deep-link strip sends the researcher to that
// resource to sign in there (DeepLinkStrip, §6.4) — Chaperone never asks.
//
// If a second input is ever added to this interface, §7.15 has to be re-argued
// from scratch rather than assumed.

export interface SearchBoxProps {
  query: string;
  busy: boolean;
  onQueryChange: (q: string) => void;
  onSubmit: (q: string) => void;
}

/**
 * One per input kind the resolver handles, so the box teaches its own grammar
 * (§7.1 — a researcher should not have to choose a database or an id type).
 * `SARS-CoV-2` is here because free text resolves as BOTH a trait and an
 * organism (M5), which is the least obvious thing the box does.
 */
const EXAMPLES = ['SCN9A', 'Q15858', 'ENSG00000169432', 'rs1333049', 'neuropathic pain', 'SARS-CoV-2'];

export function SearchBox({ query, busy, onQueryChange, onSubmit }: SearchBoxProps) {
  return (
    <>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Gene symbol, rsID, UniProt accession, Ensembl ID, PDB entry, disease or organism"
          aria-label="Subject to look up"
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" disabled={busy || !query.trim()}>
          {busy ? 'Resolving…' : 'Look up'}
        </button>
      </form>

      <div className="examples">
        Try{' '}
        {EXAMPLES.map((ex, i) => (
          <span key={ex}>
            <button
              type="button"
              onClick={() => {
                onQueryChange(ex);
                onSubmit(ex);
              }}
            >
              {ex}
            </button>
            {i < EXAMPLES.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </div>
    </>
  );
}
