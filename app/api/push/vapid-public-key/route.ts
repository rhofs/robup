import { NextResponse } from 'next/server';

// Served from the server's own env var rather than baked into the client bundle at build time
// (a NEXT_PUBLIC_ var would need a rebuild any time the key rotates) — this is the one piece of
// the VAPID pair that's meant to be public (the whole point of "public key").
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: 'Push notifications are not configured on this server' }, { status: 503 });
  return NextResponse.json({ publicKey });
}
