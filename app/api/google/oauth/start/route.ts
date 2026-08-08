import { NextResponse } from 'next/server';
import { createGoogleOAuthClient, GOOGLE_EXPORT_SCOPES } from '@/lib/google/oauthClient';

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return new Response('Missing userId', { status: 400 });

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
