// GET /api/resolve?q=SCN9A -> canonical identifiers.
// The browser never calls an upstream API directly (PROJECT-PLAN.md §9.1).

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/resolve';
import { runnable } from '@/lib/registry';
import { availableLinks } from '@/lib/deeplinks';
import { NoEntry, Unavailable } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return NextResponse.json({ error: 'Pass ?q=' }, { status: 400 });
  }

  try {
    const { ids, explanation, notes } = await resolve(q);
    return NextResponse.json({
      ids,
      explanation,
      notes,
      // Which panels the dashboard should request for this subject.
      // `presets` comes along so the preset bar can filter the set it already
      // has rather than re-resolving (§11.2 — a filter, never a reorder).
      panels: runnable(ids).map((c) => ({
        id: c.id,
        name: c.name,
        source: c.source,
        layer: c.layer,
        presets: c.presets,
      })),
      // §6.4 — pre-filled URLs for the resources Chaperone does not query.
      // They depend only on the identifiers, so they come back with the
      // resolution rather than waiting on any panel.
      deepLinks: availableLinks(ids).map(({ link, href }) => ({
        id: link.id,
        name: link.name,
        source: link.source,
        href,
        access: link.access,
        lands: link.lands,
        verifiedBy: link.verifiedBy,
        presets: link.presets,
        note: link.note,
      })),
    });
  } catch (e) {
    if (e instanceof NoEntry) {
      return NextResponse.json({ error: e.message, kind: 'empty' }, { status: 404 });
    }
    if (e instanceof Unavailable) {
      return NextResponse.json({ error: `Resolver source unavailable: ${e.message}`, kind: 'unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error', kind: 'unavailable' }, { status: 500 });
  }
}
