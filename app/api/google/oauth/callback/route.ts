import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from '@/lib/google/oauthClient';
import { getCurrentUserId } from '@/lib/auth/session';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateUserId = url.searchParams.get('state');
  const origin = url.origin;

  if (!code || !stateUserId) return new Response('Missing code or state', { status: 400 });

  // The browser's session cookie survives the external round-trip to Google and back (it's tied
  // to the browser/origin, not the navigation path) — re-derive identity from it independently
  // rather than trusting `state` alone, and require the two to agree. Closes the same class of
  // spoofing gap fixed in .../start/route.ts: without this, anyone who got a victim to hit
  // /api/google/oauth/start?userId=<victim> (back when that param was trusted) could complete
  // consent with their own Google account and have the resulting refresh token attached to the
  // victim's row instead of their own.
  const callerId = await getCurrentUserId();
  if (!callerId || callerId !== stateUserId) return new Response('Session mismatch', { status: 403 });
  const userId = callerId;

  const oauth2Client = createGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    // Happens if the user had already granted consent before and Google didn't re-issue one —
    // the start route always passes prompt: 'consent' specifically to avoid this, but a stale
    // authorization can still occasionally skip it. Send them back to try again.
    return NextResponse.redirect(`${origin}/?googleConnect=retry`);
  }
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  await prisma.user.update({
    where: { id: userId },
    data: { googleRefreshToken: tokens.refresh_token, googleEmail: profile.email ?? null },
  });

  return NextResponse.redirect(`${origin}/?googleConnect=success`);
}
