'use client';

// Start a lookup from a structure file. PROJECT-PLAN.md §11.9.
//
// §7.15 SAID THE SEARCH BOX WAS THE ONLY INPUT, and SearchBox.tsx said that if
// a second one ever appeared the rule had to be re-argued rather than assumed.
// This is that second input, so here is the argument.
//
// The rule protects §3.1: Chaperone never handles anyone's credentials. The
// enforcement mechanism was "there is nowhere to type one", which is strong
// precisely because it needs no judgment. A file input weakens that only if a
// file can carry a credential to us — and the guarantee here is stronger than
// the typed-field one, not weaker: THE FILE NEVER LEAVES THE BROWSER. It is
// read with the File API, parsed by lib/structure.ts (which performs no I/O),
// and the only thing that travels is an accession string — the same string the
// researcher could have typed into the search box.
//
// So the invariant is restated, not relaxed:
//   · no field accepts a credential — still true, and now checked by shape
//     rather than by counting inputs (criterion 15);
//   · nothing a researcher gives us is transmitted except identifiers they
//     could have typed (criterion 15b).
//
// WHY THAT SECOND GUARANTEE MATTERS SEPARATELY. An unpublished structure is an
// unpublished result. A tool that quietly posted it to a server would be
// unusable by exactly the people this is built for, whatever its privacy
// policy said. Keeping the parse client-side is not a performance decision.

import { useCallback, useRef, useState } from 'react';
import { parseStructure, lookupCandidates, MAX_STRUCTURE_BYTES } from '@/lib/structure';
import type { ParsedStructure, StructureRef } from '@/lib/structure';

export interface StructureDropProps {
  open: boolean;
  /** Runs the ordinary lookup for an accession read out of the file. */
  onSubmit: (query: string) => void;
  onClose: () => void;
}

const ORIGIN_LABEL: Record<StructureRef['from'], string> = {
  struct_ref: 'from the file’s _struct_ref record',
  DBREF: 'from the file’s DBREF record',
  ma_target_ref: 'from the model’s target record',
  filename: 'from the FILENAME, not the contents',
};

const ACCEPT = '.pdb,.ent,.cif,.mmcif,.pdb.gz,.cif.gz,.ent.gz';

export function StructureDrop({ open, onSubmit, onClose }: StructureDropProps) {
  const [parsed, setParsed] = useState<ParsedStructure | null>(null);
  const [name, setName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (file: File) => {
      setError(null);
      setParsed(null);
      setName(file.name);

      if (file.size > MAX_STRUCTURE_BYTES) {
        setError(
          `That file is ${(file.size / 1048576).toFixed(0)} MB, over the ${MAX_STRUCTURE_BYTES / 1048576} MB this reads in one go. Chaperone only needs the header records — a trimmed file, or the entry at RCSB, will do.`,
        );
        return;
      }

      setReading(true);
      try {
        let text: string;
        if (/\.gz$/i.test(file.name)) {
          // RCSB serves .gz by default, so refusing it would send people off to
          // decompress a file by hand for no reason.
          if (typeof DecompressionStream === 'undefined') {
            setError('This browser cannot decompress .gz files. Unzip it first and drop the plain file.');
            setReading(false);
            return;
          }
          const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
          text = await new Response(stream).text();
        } else {
          text = await file.text();
        }
        setParsed(parseStructure(text, file.name));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file.');
      } finally {
        setReading(false);
      }
    },
    [],
  );

  if (!open) return null;

  const candidates = parsed ? lookupCandidates(parsed) : [];

  return (
    <section className="structure" aria-label="Start from a structure file">
      <div className="fb-head">
        <div className="layer-title">Start from a structure</div>
        <button type="button" className="chip" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="fb-intro">
        Drop a PDB or mmCIF file — a deposited entry, an AlphaFold model, or your own prediction — and
        Chaperone reads the cross-references it already declares, then looks that protein up across every
        source. <strong>The file is read in this browser and never uploaded.</strong> Only the accession it
        names is sent anywhere, which is the same string you could type above.
      </p>

      <div
        className={`dropzone${dragging ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handle(file);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          // Named for what it takes. §7.15 is checked on the SHAPE of every
          // field now, and this one must read unambiguously as a structure
          // file and nothing else.
          name="structure-file"
          aria-label="Structure file to read (PDB or mmCIF)"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handle(file);
          }}
        />
        <button type="button" className="chip action" onClick={() => inputRef.current?.click()}>
          Choose a structure file
        </button>
        <span className="dim"> or drag one here · .pdb, .cif, .ent, optionally .gz</span>
      </div>

      {reading && <p className="fb-intro dim">Reading {name}…</p>}

      {error && <div className="error-box">{error}</div>}

      {parsed && (
        <div className="struct-card">
          <div className="struct-head">
            <span className="struct-name">{parsed.entryId ?? name}</span>
            {parsed.predicted ? (
              <span className="badge unconfigured">predicted model</span>
            ) : (
              <span className="badge data">experimental</span>
            )}
            <span className="dim">
              {parsed.format === 'mmcif' ? 'mmCIF' : 'PDB'} · {(parsed.bytes / 1048576).toFixed(2)} MB ·
              parsed in {parsed.parseMs} ms, in this browser
            </span>
          </div>

          {parsed.title && <p className="struct-title">{parsed.title}</p>}

          <div className="struct-facts">
            {parsed.method && (
              <div className="fact">
                <div className="label">Method</div>
                <div className="value">{parsed.method}</div>
              </div>
            )}
            {parsed.predictedBy && (
              <div className="fact">
                <div className="label">Produced by</div>
                <div className="value">{parsed.predictedBy}</div>
                <div className="note">
                  A computed model. It is a hypothesis about the fold, not a measurement of one.
                </div>
              </div>
            )}
            {parsed.resolutionA !== undefined && (
              <div className="fact">
                <div className="label">Resolution</div>
                <div className="value">{parsed.resolutionA.toFixed(2)} Å</div>
                <div className="note">
                  {parsed.resolutionFrom} — stated by the file. Resolutions from different methods are not
                  directly comparable.
                </div>
              </div>
            )}
            {parsed.geneHint && (
              <div className="fact">
                <div className="label">Gene (stated by the file)</div>
                <div className="value">
                  {parsed.geneHint}
                  {parsed.taxonHint ? ` · NCBI taxon ${parsed.taxonHint}` : ''}
                </div>
              </div>
            )}
          </div>

          {parsed.refs.length > 0 && (
            <>
              <div className="struct-sub">
                Cross-references the file declares — {parsed.refs.length}
                {parsed.chains.length > 1 ? `, across ${parsed.chains.length} chains` : ''}
              </div>
              <div className="struct-refs">
                {parsed.refs.map((r, i) => {
                  const actionable = candidates.some((c) => c.accession === r.accession);
                  return (
                    <div key={`${r.accession}-${i}`} className="struct-ref">
                      <code>{r.accession}</code>
                      <span className="struct-ref-db">{r.db}</span>
                      {r.entryName && <span className="dim">{r.entryName}</span>}
                      {r.chains.length > 0 && (
                        <span className="dim">chain {r.chains.join(', ')}</span>
                      )}
                      <span className={`struct-origin${r.from === 'filename' ? ' weak' : ''}`}>
                        {ORIGIN_LABEL[r.from]}
                      </span>
                      {actionable ? (
                        <button type="button" className="chip action" onClick={() => onSubmit(r.accession)}>
                          Look this up
                        </button>
                      ) : (
                        <span className="dim">
                          not a UniProt reference — Chaperone resolves on UniProt
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {parsed.chains.length > 1 && (
                <p className="fb-intro dim">
                  This is a complex, so it is several proteins. Chaperone looks up one subject at a time —
                  pick the chain you are asking about.
                </p>
              )}
            </>
          )}

          {parsed.warnings.map((w) => (
            <p key={w} className="struct-warning">
              {w}
            </p>
          ))}

          {parsed.pdbId && (
            <p className="fb-intro">
              <a
                href={`https://www.rcsb.org/structure/${parsed.pdbId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {parsed.pdbId} at RCSB ↗
              </a>{' '}
              <span className="dim">— this entry is deposited, so the source has the full record.</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
