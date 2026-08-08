import { google } from 'googleapis';

// Bare process.env.X reads with no wrapper/validation layer, same convention
// server/collabServer.ts already uses for COLLAB_PORT. Required at the point a Google flow is
// actually used (OAuth start/callback, or an export), not at module load, so the rest of the app
// still runs fine before these are configured.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see PLANNING.md's Google Docs export setup steps.`);
  return value;
}

export function createGoogleOAuthClient() {
  return new google.auth.OAuth2(requireEnv('GOOGLE_CLIENT_ID'), requireEnv('GOOGLE_CLIENT_SECRET'), requireEnv('GOOGLE_REDIRECT_URI'));
}

export const GOOGLE_EXPORT_SCOPES = ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/userinfo.email'];
