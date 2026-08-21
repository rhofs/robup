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

// One shared "Connect Google" flow/refresh token backs both the Docs export feature and
// Calendar two-way sync (backlog #13) — a single consent grants both, rather than two separate
// connect buttons and two stored tokens for what's really one Google account link. Anyone who
// connected before the calendar scope existed needs to reconnect once (Google re-prompts for
// consent automatically when the requested scope set changes — the existing oauth/start route's
// prompt: 'consent' already forces this).
// The full (not `calendar.events`-only) Calendar scope is required here — creating the dedicated
// "Siqt" calendar itself (calendar.calendars.insert, in lib/google/calendarSync.ts) operates on
// the Calendars resource, which only the full `calendar` scope covers; `calendar.events` alone
// would cover reading/writing events but not creating the calendar they live in.
export const GOOGLE_EXPORT_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
];
