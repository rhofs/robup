import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { createGoogleOAuthClient } from '@/lib/google/oauthClient';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const userId = url.searchParams.get('state');
  const origin = url.origin;

  if (!code || !userId) return new Response('Missing code or state', { status: 400 });

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
