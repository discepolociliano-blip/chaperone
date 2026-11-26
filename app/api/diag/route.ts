// GET /api/diag            -> { outboundAttempts }
// GET /api/diag?echo=1      -> the headers a third-party server actually saw
//
// A verification aid for PROJECT-PLAN.md §7 criteria 12 and 13, and NOT part
// of the product: it returns 404 outside development, so nothing here is
// reachable on the deployed app.
//
// Why it exists rather than reading the code:
//
//   Criterion 12 ("a repeated identical query inside the TTL makes zero
//   upstream requests") cannot be settled by the `cached` flag, because that
//   flag is the cache layer reporting on itself. `outboundAttempts` is
//   incremented at the single line where a request leaves the process, so a
//   second identical query that moves it by zero is proof.
//
//   Criterion 13 ("every outbound request carries the Chaperone User-Agent")
//   is likewise a claim about what a remote server receives. `?echo=1` sends
//   one real request through the ordinary `fetchJson` path to an echo service
//   and returns the headers it saw. Reading `lib/http.ts` shows the intent;
//   this shows the result.

import { NextResponse } from 'next/server';
import { fetchJson, outboundAttemptCount } from '@/lib/http';

export const dynamic = 'force-dynamic';

interface EchoResponse {
  headers?: Record<string, string>;
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const echo = new URL(request.url).searchParams.get('echo');
  if (!echo) {
    return NextResponse.json({ outboundAttempts: outboundAttemptCount() });
  }

  // Deliberately uncached (ttlMs 0 would still cache; omit the key reuse by
  // using a nonce) so the echo reflects a request made right now.
  const nonce = Date.now();
  try {
    const { json } = await fetchJson<EchoResponse>(`https://httpbin.org/headers?n=${nonce}`, {
      timeoutMs: 20000,
    });
    return NextResponse.json({
      outboundAttempts: outboundAttemptCount(),
      seenByRemote: json.headers ?? {},
    });
  } catch (e) {
    return NextResponse.json(
      {
        outboundAttempts: outboundAttemptCount(),
        error: e instanceof Error ? e.message : 'echo failed',
      },
      { status: 502 },
    );
  }
}
