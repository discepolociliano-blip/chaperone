'use client';

// The resources Chaperone deliberately does not query. §6.4, §3.1.
//
// Two jobs, and the second is the reason this exists at all.
//
// 1. The researcher never re-types an identifier. Every link here is built
//    from the resolved ids, so the right page opens for the current subject.
//
// 2. CREDENTIALS HAPPEN AT THE SOURCE, NEVER HERE. §3.1 is that Chaperone
//    never handles anyone's database credentials — holding them would be a
//    security liability and would breach the data-use agreements of every
//    controlled-access resource. This strip is how that promise is kept
//    usable rather than merely safe: where a resource needs an account, we
//    send the researcher to that resource to sign in there. Together with
//    SearchBox being the page's only input, that is §7.15.
//
// Each link says what it lands on, because a button that silently drops
// someone on a generic search page teaches them the resource has nothing for
// their gene — our limitation read as the source's answer (§5.4 again).

import type { Preset } from '@/lib/types';
import type { DeepLinkInfo } from './useLookup';

export interface DeepLinkStripProps {
  links: DeepLinkInfo[];
  preset: Preset | null;
}

const ACCESS_NOTE: Record<DeepLinkInfo['access'], string> = {
  open: '',
  credentialed: 'sign in with your own account',
  application: 'controlled access — application route',
};

const LANDS_NOTE: Record<DeepLinkInfo['lands'], string> = {
  record: 'opens this subject',
  'prefilled-search': 'opens a search already filled in',
  index: 'opens the resource — no per-subject URL exists, so search there',
};

export function DeepLinkStrip({ links, preset }: DeepLinkStripProps) {
  // §11.2 applies here too: a preset filters the strip, it does not reorder it.
  const shown = links.filter((l) => !preset || l.presets.length === 0 || l.presets.includes(preset));
  if (!shown.length) return null;

  const open = shown.filter((l) => l.access === 'open');
  const gated = shown.filter((l) => l.access !== 'open');

  const render = (l: DeepLinkInfo) => (
    <a
      key={l.id}
      className={`deeplink ${l.access}`}
      href={l.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${l.note}\n\n${LANDS_NOTE[l.lands]}`}
    >
      <span className="dl-name">{l.name}</span>
      <span className="dl-meta">
        {l.source}
        {l.lands !== 'record' && <span className="dl-lands"> · {LANDS_NOTE[l.lands]}</span>}
        {ACCESS_NOTE[l.access] && <span className="dl-access"> · {ACCESS_NOTE[l.access]}</span>}
      </span>
    </a>
  );

  return (
    <section className="deeplinks">
      <div className="layer-title">Open at the source</div>
      <div className="dl-grid">{open.map(render)}</div>

      {gated.length > 0 && (
        <>
          <div className="dl-gated-note">
            These need your own credentials. Chaperone never asks for them and never stores them — you sign in
            at the resource itself (§3.1).
          </div>
          <div className="dl-grid">{gated.map(render)}</div>
        </>
      )}
    </section>
  );
}
