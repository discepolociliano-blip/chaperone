// Preset definitions. PROJECT-PLAN.md §11.2.
//
// A preset FILTERS the panel set; it never reorders it. The filtering itself
// lives in `registry.forPreset` — this file holds what a preset IS: its label,
// what it is for, and the trait vocabulary that lets `suggest.ts` propose it.
//
// (§7.16 used to read "each preset reorders panels", which contradicted §11.2
// and `forPreset`. Corrected 2026-11-06. A criterion that disagrees with the
// decision it checks would have failed a correct build.)

import type { Preset } from './types';

export interface PresetDef {
  id: Preset;
  label: string;
  /** What this preset is for, shown next to the filter. */
  blurb: string;
  /**
   * Lower-case substrings matched against trait and disease names returned by
   * sources, used by `suggest.ts` to propose this preset.
   *
   * THIS IS KEYWORD MATCHING, NOT ONTOLOGY REASONING. It reads the name a
   * source gave a trait; it does not walk EFO or MONDO. It will therefore
   * sometimes fire on a name that merely contains the word, and will miss a
   * trait whose name uses different words for the same thing. Every suggestion
   * built from it says so, and names the trait it matched, so a researcher can
   * see the match and dismiss it (§8: labelled with the rule that produced it).
   */
  traitKeywords: string[];
}

export const PRESETS: PresetDef[] = [
  {
    id: 'pain',
    label: 'Pain',
    blurb:
      'Nociception, analgesia and pain-associated variation. Carries the deep-link strip to the ' +
      'human DRG resources GTEx cannot cover (§11.5).',
    traitKeywords: [
      'pain',
      'nocicept',
      'analgesi',
      'analgesic',
      'opioid',
      'migraine',
      'headache',
      'neuralgia',
      'neuropath',
      'fibromyalgia',
      'allodynia',
      'hyperalgesia',
      'erythromelalgia',
      'sciatica',
      'arthralgia',
      'insensitivity to pain',
      'channelopathy-associated',
    ],
  },
  {
    id: 'psych-neuro',
    label: 'Psychiatric & neuro',
    blurb:
      'Psychiatric, cognitive and neurological traits — the genetics-as-finding-tool case for ' +
      'brain phenotypes.',
    traitKeywords: [
      'schizophreni',
      'bipolar',
      'depress',
      'anxiety',
      'autis',
      'attention deficit',
      'adhd',
      'neuroticism',
      'cognitiv',
      'intelligence',
      'educational attainment',
      'alzheimer',
      'parkinson',
      'epilep',
      'seizure',
      'encephalopathy',
      'ataxia',
      'neurodegener',
      'addiction',
      'substance use',
      'smoking',
      'alcohol',
      'insomnia',
      'sleep',
      'obsessive',
      'post-traumatic',
      'anorexia',
      'tourette',
      'dementia',
      'motor neuron',
      'multiple sclerosis',
      'migraine',
    ],
  },
  {
    id: 'antiviral',
    label: 'Antiviral (host-directed)',
    blurb:
      'Host factors and organism context. Host-directed only, per §11.6 — no viral structures ' +
      'and no direct-acting antiviral chemistry.',
    traitKeywords: [
      'infection',
      'infectious',
      'viral',
      'virus',
      'covid',
      'sars-cov',
      'influenza',
      'hepatitis',
      'hiv',
      'interferon',
      'immunodeficiency',
      'sepsis',
      'pneumonia',
    ],
  },
];

export function presetById(id: Preset): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Which presets a trait name matches, with the keyword that matched.
 *
 * Returns every match rather than a single best guess: "migraine" is
 * deliberately in both the pain and the psych-neuro vocabularies, because it
 * is genuinely both, and picking one for the researcher would hide the other.
 */
export function presetsForTrait(traitName: string): { preset: Preset; matched: string }[] {
  const t = traitName.toLowerCase();
  const out: { preset: Preset; matched: string }[] = [];
  for (const p of PRESETS) {
    const matched = p.traitKeywords.find((k) => t.includes(k));
    if (matched) out.push({ preset: p.id, matched });
  }
  return out;
}
