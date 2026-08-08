import { NextResponse } from 'next/server';
import { createGoogleOAuthClient, GOOGLE_EXPORT_SCOPES } from '@/lib/google/oauthClient';
import { getCurrentUserId } from '@/lib/auth/session';

export async function GET() {
  // Previously read ?userId= straight off the query string with zero verification — anyone could
  // trigger this flow with a victim's id, then complete Google's consent with their own Google
  // account, attaching their own refresh token to the victim's User row. Now derived from the
  // caller's own session; the callback (see .../callback/route.ts) independently re-derives it
  // too and requires the two to match before writing anything.
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Not authenticated', { status: 401 });

  let oauth2Client;
  try {
    oauth2Client = createGoogleOAuthClient();
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Google OAuth is not configured.', { status: 500 });
  }

  // access_type: 'offline' + prompt: 'consent' are both required to actually get a refresh
  // token back — Google only issues one on the first consent (or when re-forced via prompt).
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_EXPORT_SCOPES,
    state: userId,
  });
  return NextResponse.redirect(url);
}
