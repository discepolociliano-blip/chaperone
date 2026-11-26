// Reading a structure file for the identifiers it already declares.
// PROJECT-PLAN.md §11.9.
//
// WHY THIS EXISTS. A researcher with a structure open — a deposited entry, an
// AlphaFold model, a colleague's unpublished prediction — knows what they are
// looking at and still has to type its name into every site. The file already
// says which protein it is: PDB cross-references it in DBREF records, mmCIF in
// _struct_ref, AlphaFold in _ma_target_ref_db_details. Reading that is a way
// of starting a lookup from the thing in front of you.
//
// WHAT THIS DELIBERATELY IS NOT. It is not structure analysis, and it never
// infers identity from coordinates. It reports the cross-references the file
// states and nothing more. A file with no cross-reference produces no
// identifier, and says so — guessing from the geometry would be exactly the
// kind of derived claim §5.5 exists to prevent.
//
// WHERE IT RUNS. In the browser, and only there. An unpublished structure is
// somebody's unpublished result, so it must not travel: the file is read with
// FileReader, parsed here, and only the ACCESSIONS it declares are sent to
// /api/resolve — the same strings the researcher could have typed. Nothing in
// this module performs I/O; that is what makes the guarantee checkable rather
// than merely intended (criterion 15b).
//
// PROVENANCE IS PART OF THE ANSWER. Every identifier carries where it was
// read from, including the weakest source: the filename. AlphaFold's download
// is called AF-Q15858-F1-model_v6.cif, so the accession is in the name as well
// as the contents — but a name can be renamed and contents cannot, so the two
// are never merged into one undifferentiated claim (§6.5).

export type RefOrigin = 'DBREF' | 'struct_ref' | 'ma_target_ref' | 'filename';

export interface StructureRef {
  /** The cross-referenced accession, e.g. Q15858. */
  accession: string;
  /** The database the file named: UNP (UniProt), GB, EMBL, PDB… */
  db: string;
  /** The entry name where given, e.g. SCN9A_HUMAN. */
  entryName?: string;
  /** Chains this reference covers. Empty when the file did not say. */
  chains: string[];
  /** Which record this was read from. Never merged across origins. */
  from: RefOrigin;
  /** The residue range of the reference, where the file gives one. */
  range?: { begin: number; end: number };
}

export interface ParsedStructure {
  format: 'pdb' | 'mmcif';
  /** The file's own identifier: a PDB code, or AF-Q15858-F1, or absent. */
  entryId?: string;
  /** Set only when `entryId` is a real four-character PDB code. */
  pdbId?: string;
  title?: string;
  /** EXPDTA / _exptl.method, verbatim. Absent for a predicted model. */
  method?: string;
  resolutionA?: number;
  /**
   * What KIND of resolution that number is.
   *
   * An X-ray `d_res_high` and a cryo-EM FSC 0.143 figure are different
   * quantities that happen to share a unit, and they live in different mmCIF
   * categories (`_refine` and `_em_3d_reconstruction`). Printing "3.0 Å" for
   * both without saying which would invite a comparison that is not valid —
   * the §5.5 rule about derived numbers, applied to a number we did not derive.
   */
  resolutionFrom?: string;
  /** A computed model rather than an experiment. Stated, never assumed. */
  predicted: boolean;
  predictedBy?: string;
  /** Distinct chain identifiers seen in the cross-reference records. */
  chains: string[];
  refs: StructureRef[];
  /** Gene symbol, where the file states one (AlphaFold/ModelArchive do). */
  geneHint?: string;
  /** NCBI taxon id, where the file states one. */
  taxonHint?: string;
  /**
   * Everything the file did not let us conclude. These are shown, not
   * swallowed: "this file declares no cross-reference" is an answer about the
   * file, and the researcher needs it to know why no panels appeared (§5.4).
   */
  warnings: string[];
  bytes: number;
  parseMs: number;
}

/** The largest file we will read into memory. Beyond this we decline and say so. */
export const MAX_STRUCTURE_BYTES = 64 * 1024 * 1024;

/** UniProt accession, per their own published pattern. */
const UNIPROT_RE =
  /\b([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})\b/;

/** The databases whose accessions the resolver can actually act on. */
const ACTIONABLE_DB = new Set(['UNP', 'UNIPROT', 'UNIPROTKB']);

export function isActionable(ref: StructureRef): boolean {
  return ACTIONABLE_DB.has(ref.db.toUpperCase());
}

// ── format detection ──────────────────────────────────────────────────────

export function detectFormat(text: string, filename?: string): 'pdb' | 'mmcif' {
  // Contents decide, not the extension: files get renamed, and a .pdb holding
  // mmCIF is common enough that trusting the name would misparse silently.
  const head = text.slice(0, 4096);
  if (/^data_/m.test(head) || /^_entry\./m.test(head) || /^loop_$/m.test(head)) return 'mmcif';
  if (/^(HEADER|ATOM  |HETATM|REMARK|TITLE |EXPDTA|DBREF)/m.test(head)) return 'pdb';
  // Nothing recognisable in the first pages; fall back to the extension, and
  // the caller reports the warning this produces.
  return /\.(cif|mmcif|bcif)$/i.test(filename ?? '') ? 'mmcif' : 'pdb';
}

// ── legacy PDB ────────────────────────────────────────────────────────────

/** Fixed-width slice, trimmed. PDB columns are 1-based in the spec. */
function col(line: string, from: number, to: number): string {
  return line.slice(from - 1, to).trim();
}

function parsePdb(text: string): Omit<ParsedStructure, 'format' | 'bytes' | 'parseMs'> {
  const warnings: string[] = [];
  const refs: StructureRef[] = [];
  let entryId: string | undefined;
  let title = '';
  let method: string | undefined;
  let resolutionA: number | undefined;
  let predictedBy: string | undefined;

  // DBREF1/DBREF2 split one reference across two lines, keyed by chain.
  const pendingDbref1 = new Map<string, { entryName: string; begin: number; end: number }>();

  for (const line of text.split(/\r?\n/)) {
    const rec = line.slice(0, 6);

    if (rec === 'HEADER') {
      const id = col(line, 63, 66);
      // AlphaFold writes a HEADER with no entry code. An empty code is a fact
      // about the file, not a parse failure.
      if (id && id !== 'XXXX') entryId = id;
    } else if (rec === 'TITLE ') {
      title += (title ? ' ' : '') + line.slice(10).trim();
    } else if (rec === 'EXPDTA') {
      method = (method ? `${method} ` : '') + line.slice(10).trim();
    } else if (rec === 'REMARK' && /^REMARK   2 RESOLUTION\./.test(line)) {
      const m = line.match(/RESOLUTION\.\s*([0-9.]+)\s*ANGSTROM/i);
      if (m?.[1]) resolutionA = Number(m[1]);
    } else if (rec === 'DBREF ') {
      const db = col(line, 27, 32);
      const accession = col(line, 34, 41);
      if (accession) {
        refs.push({
          accession,
          db,
          entryName: col(line, 43, 54) || undefined,
          chains: [col(line, 13, 13)].filter(Boolean),
          from: 'DBREF',
          range: rangeOf(col(line, 15, 18), col(line, 21, 24)),
        });
      }
    } else if (rec === 'DBREF1') {
      const chain = col(line, 13, 13);
      pendingDbref1.set(chain, {
        entryName: col(line, 48, 67),
        ...(rangeOf(col(line, 15, 18), col(line, 21, 24)) ?? { begin: 0, end: 0 }),
      });
    } else if (rec === 'DBREF2') {
      // The accession lives on the continuation line; without its DBREF1 we
      // would not know the chain, so an orphan is reported rather than guessed.
      const chain = col(line, 13, 13);
      const accession = col(line, 19, 40);
      const first = pendingDbref1.get(chain);
      if (accession && first) {
        refs.push({
          accession,
          db: 'UNP',
          entryName: first.entryName || undefined,
          chains: [chain].filter(Boolean),
          from: 'DBREF',
          ...(first.begin || first.end ? { range: { begin: first.begin, end: first.end } } : {}),
        });
        pendingDbref1.delete(chain);
      } else if (accession) {
        warnings.push(`A DBREF2 record for chain ${chain || '?'} had no matching DBREF1; it was skipped.`);
      }
    }
  }

  // AlphaFold's PDB export is identifiable from its own TITLE, which is the
  // file saying what it is rather than us inferring it from the numbers.
  const titleUpper = title.toUpperCase();
  if (titleUpper.includes('ALPHAFOLD')) predictedBy = 'AlphaFold';
  else if (/\b(PREDICTION|PREDICTED MODEL)\b/.test(titleUpper)) predictedBy = 'a prediction pipeline';

  // A legacy PDB file puts every method's resolution in the same REMARK 2, so
  // the KIND has to be read off EXPDTA — see the note on `resolutionFrom`.
  const resolutionFrom =
    resolutionA === undefined
      ? undefined
      : /ELECTRON MICROSCOPY|ELECTRON CRYSTALLOGRAPHY/i.test(method ?? '')
        ? 'reconstruction, as stated in REMARK 2'
        : 'diffraction, highest resolution shell';

  return {
    entryId,
    pdbId: entryId && /^[0-9][A-Za-z0-9]{3}$/.test(entryId) ? entryId.toUpperCase() : undefined,
    title: title || undefined,
    method: method || undefined,
    resolutionA,
    resolutionFrom,
    predicted: Boolean(predictedBy),
    predictedBy,
    chains: [...new Set(refs.flatMap((r) => r.chains))],
    refs,
    warnings,
  };
}

function rangeOf(a: string, b: string): { begin: number; end: number } | undefined {
  const begin = Number(a);
  const end = Number(b);
  return Number.isFinite(begin) && Number.isFinite(end) && (begin || end) ? { begin, end } : undefined;
}

// ── mmCIF ─────────────────────────────────────────────────────────────────
//
// A small STAR reader, not a general one. It understands the three things the
// format uses to hold a value — bare words, quoted strings, and semicolon text
// blocks — and it skips the atom_site loop by line rather than tokenising it,
// because that loop is 99% of a structure file and none of it is wanted here.

interface CifDoc {
  /** Single-valued items: `_entry.id` → `6J8E`. */
  items: Map<string, string>;
  /** Loops, keyed by category: `_struct_ref` → rows of tag → value. */
  loops: Map<string, Record<string, string>[]>;
}

const SKIP_LOOPS = new Set(['_atom_site', '_atom_site_anisotrop', '_pdbx_poly_seq_scheme', '_ma_qa_metric_local']);

function splitCifLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '#') break; // comment to end of line
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      // A quote only closes when followed by whitespace or end-of-line, which
      // is what lets values like 5'-triphosphate survive unmangled.
      while (j < line.length) {
        if (line[j] === quote && (j + 1 >= line.length || line[j + 1] === ' ' || line[j + 1] === '\t')) break;
        buf += line[j];
        j++;
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
    out.push(line.slice(i, j));
    i = j;
  }
  return out;
}

function readCif(text: string): CifDoc {
  const lines = text.split(/\r?\n/);
  const items = new Map<string, string>();
  const loops = new Map<string, Record<string, string>[]>();

  // Reads a semicolon-delimited text block beginning at `i`, returning the
  // joined value and the index of its closing line.
  const readTextBlock = (i: number): { value: string; next: number } => {
    let buf = (lines[i] ?? '').slice(1);
    let j = i + 1;
    while (j < lines.length && !(lines[j] ?? '').startsWith(';')) {
      buf += `\n${lines[j]}`;
      j++;
    }
    return { value: buf.trim(), next: j };
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('data_')) {
      i++;
      continue;
    }

    if (trimmed === 'loop_') {
      const tags: string[] = [];
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? '').trim().startsWith('_')) {
        tags.push((lines[j] ?? '').trim());
        j++;
      }
      const category = tags[0]?.split('.')[0] ?? '';

      if (SKIP_LOOPS.has(category)) {
        // Walk past the rows without tokenising any of them.
        while (
          j < lines.length &&
          !(lines[j] ?? '').startsWith('#') &&
          !(lines[j] ?? '').trim().startsWith('_') &&
          (lines[j] ?? '').trim() !== 'loop_'
        ) {
          j++;
        }
        i = j;
        continue;
      }

      // Collect values until the loop's tag count stops dividing evenly and a
      // structural line appears.
      const values: string[] = [];
      while (j < lines.length) {
        const l = lines[j] ?? '';
        const t = l.trim();
        if (t === 'loop_' || t.startsWith('data_')) break;
        if (t.startsWith('#')) {
          j++;
          break;
        }
        if (t.startsWith('_') && values.length % tags.length === 0) break;
        if (l.startsWith(';')) {
          const block = readTextBlock(j);
          values.push(block.value);
          j = block.next + 1;
          continue;
        }
        values.push(...splitCifLine(l));
        j++;
      }

      const rows: Record<string, string>[] = [];
      for (let k = 0; k + tags.length <= values.length; k += tags.length) {
        const row: Record<string, string> = {};
        tags.forEach((tag, t) => {
          row[tag] = values[k + t] ?? '';
        });
        rows.push(row);
      }
      if (category) loops.set(category, rows);
      i = j;
      continue;
    }

    if (trimmed.startsWith('_')) {
      const parts = splitCifLine(line);
      const tag = parts[0] ?? '';
      if (parts.length > 1) {
        items.set(tag, parts.slice(1).join(' '));
        i++;
      } else {
        // The value is on the following line, possibly as a text block.
        const nextLine = lines[i + 1] ?? '';
        if (nextLine.startsWith(';')) {
          const block = readTextBlock(i + 1);
          items.set(tag, block.value);
          i = block.next + 1;
        } else {
          items.set(tag, splitCifLine(nextLine).join(' '));
          i += 2;
        }
      }
      continue;
    }

    i++;
  }

  return { items, loops };
}

function clean(v: string | undefined): string | undefined {
  // `?` is "unknown" and `.` is "not applicable" in mmCIF. Both mean we were
  // told nothing, and neither should ever reach a reader as a value.
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === '' || t === '?' || t === '.' ? undefined : t;
}

function parseMmcif(text: string): Omit<ParsedStructure, 'format' | 'bytes' | 'parseMs'> {
  const warnings: string[] = [];
  const { items, loops } = readCif(text);
  const refs: StructureRef[] = [];

  const entryId = clean(items.get('_entry.id'));

  // Chain mapping lives in _struct_ref_seq, which joins a reference to the
  // strands it covers. Without it a multi-chain complex would report its
  // accessions with no indication of which chain is which.
  const chainsByRefId = new Map<string, Set<string>>();
  for (const row of loops.get('_struct_ref_seq') ?? []) {
    const refId = clean(row['_struct_ref_seq.ref_id']);
    const strand = clean(row['_struct_ref_seq.pdbx_strand_id']);
    if (!refId || !strand) continue;
    const set = chainsByRefId.get(refId) ?? new Set<string>();
    strand.split(',').forEach((s) => set.add(s.trim()));
    chainsByRefId.set(refId, set);
  }

  const structRefRows = loops.get('_struct_ref') ?? [];
  if (structRefRows.length) {
    for (const row of structRefRows) {
      const accession = clean(row['_struct_ref.pdbx_db_accession']);
      if (!accession) continue;
      const id = clean(row['_struct_ref.id']) ?? '';
      refs.push({
        accession,
        db: clean(row['_struct_ref.db_name']) ?? '?',
        entryName: clean(row['_struct_ref.db_code']),
        chains: [...(chainsByRefId.get(id) ?? [])],
        from: 'struct_ref',
      });
    }
  } else {
    // Single-reference files write the category unlooped.
    const accession = clean(items.get('_struct_ref.pdbx_db_accession'));
    if (accession) {
      refs.push({
        accession,
        db: clean(items.get('_struct_ref.db_name')) ?? '?',
        entryName: clean(items.get('_struct_ref.db_code')),
        chains: [...(chainsByRefId.get(clean(items.get('_struct_ref.id')) ?? '') ?? [])],
        from: 'struct_ref',
      });
    }
  }

  // ModelArchive / AlphaFold state the target separately, and more richly —
  // gene symbol and taxon included. Kept as its own origin rather than folded
  // into struct_ref, because it is a different claim by a different producer.
  const maAccession = clean(items.get('_ma_target_ref_db_details.db_accession'));
  if (maAccession && !refs.some((r) => r.accession === maAccession)) {
    refs.push({
      accession: maAccession,
      db: clean(items.get('_ma_target_ref_db_details.db_name')) ?? '?',
      entryName: clean(items.get('_ma_target_ref_db_details.db_code')),
      chains: [],
      from: 'ma_target_ref',
    });
  }

  const method = clean(items.get('_exptl.method')) ?? clean((loops.get('_exptl') ?? [])[0]?.['_exptl.method']);

  // X-ray and cryo-EM record resolution in different categories, and the two
  // numbers mean different things. Whichever is present is kept WITH the name
  // of where it came from.
  const xray = clean(items.get('_refine.ls_d_res_high')) ?? clean((loops.get('_refine') ?? [])[0]?.['_refine.ls_d_res_high']);
  const em = clean(items.get('_em_3d_reconstruction.resolution'));
  const emMethod = clean(items.get('_em_3d_reconstruction.resolution_method'));
  const resolution = Number(xray ?? em ?? NaN);
  const resolutionFrom = xray
    ? 'diffraction, highest resolution shell'
    : em
      ? `reconstruction${emMethod ? `, ${emMethod.toLowerCase()}` : ''}`
      : undefined;

  // "Predicted" is read from the file's own structure-determination method,
  // never inferred from a missing resolution — plenty of experimental methods
  // report none.
  const maModel = (loops.get('_ma_model_list') ?? [])[0];
  const predictedBy = maModel || items.has('_ma_target_ref_db_details.db_accession')
    ? clean(items.get('_ma_software_parameter.value')) ??
      clean(maModel?.['_ma_model_list.model_type']) ??
      (entryId?.startsWith('AF-') ? 'AlphaFold' : 'a modelling pipeline')
    : undefined;

  return {
    entryId,
    pdbId: entryId && /^[0-9][A-Za-z0-9]{3}$/.test(entryId) ? entryId.toUpperCase() : undefined,
    title: clean(items.get('_struct.title')),
    method,
    resolutionA: Number.isFinite(resolution) ? resolution : undefined,
    resolutionFrom: Number.isFinite(resolution) ? resolutionFrom : undefined,
    predicted: Boolean(predictedBy),
    predictedBy,
    chains: [...new Set(refs.flatMap((r) => r.chains))],
    refs,
    geneHint: clean(items.get('_ma_target_ref_db_details.gene_name')),
    taxonHint: clean(items.get('_ma_target_ref_db_details.ncbi_taxonomy_id')),
    warnings,
  };
}

// ── the entry point ───────────────────────────────────────────────────────

/**
 * Parse a structure file's metadata. Pure: no network, no storage, no globals.
 *
 * `filename` is used for one thing only — a last-resort accession when the
 * contents declare none — and anything found that way is tagged `'filename'`
 * so the interface can show it for what it is.
 */
export function parseStructure(text: string, filename?: string): ParsedStructure {
  const started = Date.now();
  const format = detectFormat(text, filename);
  const parsed = format === 'mmcif' ? parseMmcif(text) : parsePdb(text);
  const warnings = [...parsed.warnings];

  let refs = parsed.refs;

  if (!refs.some(isActionable)) {
    const fromName = filename?.match(UNIPROT_RE)?.[1];
    if (fromName) {
      refs = [...refs, { accession: fromName, db: 'UNP', chains: [], from: 'filename' }];
      warnings.push(
        `No UniProt cross-reference inside the file. ${fromName} was read from the FILENAME, which is weaker evidence — a file can be renamed and its contents cannot. Check it before trusting the panels below.`,
      );
    } else if (refs.length) {
      warnings.push(
        `This file cross-references ${[...new Set(refs.map((r) => r.db))].join(', ')} but not UniProt, and UniProt is what Chaperone resolves on. Nothing here can be looked up automatically.`,
      );
    } else {
      warnings.push(
        'This file declares no database cross-reference at all, so it does not say which protein it holds. Chaperone reports what a file states and does not infer identity from coordinates — type the identifier in the search box, or open the structure at RCSB to find it.',
      );
    }
  }

  if (format === 'pdb' && !parsed.entryId && !parsed.predicted) {
    warnings.push('No entry code in the HEADER record. This is usually a locally produced or edited file.');
  }

  return {
    format,
    ...parsed,
    refs,
    chains: [...new Set(refs.flatMap((r) => r.chains))],
    warnings,
    bytes: text.length,
    parseMs: Date.now() - started,
  };
}

/**
 * The accessions worth handing to the resolver, strongest origin first.
 *
 * A file's own records beat its name, and a UniProt reference beats a PDB or
 * GenBank one because that is what the resolver can act on.
 */
export function lookupCandidates(parsed: ParsedStructure): StructureRef[] {
  const rank: Record<RefOrigin, number> = { struct_ref: 0, DBREF: 0, ma_target_ref: 1, filename: 2 };
  const seen = new Set<string>();
  return parsed.refs
    .filter(isActionable)
    .filter((r) => (seen.has(r.accession) ? false : (seen.add(r.accession), true)))
    .sort((a, b) => rank[a.from] - rank[b.from]);
}
