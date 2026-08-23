import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';

// Proxies Google's Places API (New) Autocomplete endpoint — never called directly from the
// browser, both to keep GOOGLE_PLACES_API_KEY server-only (same handling as every other secret in
// this app) and to gate it behind a real session, so a stranger hitting this URL directly can't
// burn through the account's free quota (or worse, real spend past it) with no login at all.
//
// Deliberately only ever calls the Autocomplete endpoint, never Place Details — the location
// field just wants the suggested address text itself, not coordinates/place metadata, so this
// stays entirely on the cheaper Essentials-tier SKU (10K free calls/month) rather than touching
// Pro. See .env.local's own comment on GOOGLE_PLACES_API_KEY for the Google Cloud side of this
// (API enabled, billing on, a daily quota cap as the real hard stop, key restricted to this API).
//
// Silently returns `configured: false` whenever the key isn't set (local dev before Google Cloud
// setup, or a fresh deploy before the production env var is added) — the client-side input just
// behaves as a plain text field with no suggestions, no error shown, same as before this feature
// existed at all.
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false, suggestions: [] });

  const { searchParams } = new URL(req.url);
  const input = searchParams.get('input')?.trim();
  const sessionToken = searchParams.get('sessionToken') || undefined;
  if (!input || input.length < 3) return NextResponse.json({ configured: true, suggestions: [] });

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({ input, ...(sessionToken ? { sessionToken } : {}) }),
    });
    if (!res.ok) return NextResponse.json({ configured: true, suggestions: [] });
    const data = await res.json();
    const suggestions: string[] = (data.suggestions ?? [])
      .map((s: { placePrediction?: { text?: { text?: string } } }) => s.placePrediction?.text?.text)
      .filter((t: string | undefined): t is string => !!t);
    return NextResponse.json({ configured: true, suggestions });
  } catch {
    // Network failure talking to Google — same graceful "just a plain input" fallback as an
    // unconfigured key, not a broken UI.
    return NextResponse.json({ configured: true, suggestions: [] });
  }
}
