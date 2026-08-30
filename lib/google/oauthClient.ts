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
// connected before needs to reconnect once whenever this scope list narrows or widens (Google
// re-prompts for consent automatically when the requested scope set changes — the existing
// oauth/start route's prompt: 'consent' already forces this).
//
// Deliberately the *narrowest* scope that covers what this app's Google calls actually do — not
// the broadest one that would technically also work, per the user's own flagged concern that the
// original `documents` scope's consent text ("See, edit, create, and delete all your Google Docs
// documents") is real, unnecessary exposure of every *pre-existing* private doc, not just the
// ones Siqt creates:
// - `drive.file` (not `documents`) — the only Docs-API calls this app makes are
//   `documents.create` + `documents.batchUpdate` on the doc it JUST created
//   (app/api/docs/[id]/export/google/route.ts), never reading/editing/deleting anything that
//   already existed. `drive.file` is Google's own documented "per-file access, only to files
//   this app created or the user explicitly opened with it" scope — both of those Docs API calls
//   are explicitly supported under it, so nothing breaks, but the consent text becomes "...only
//   the specific Google Drive files you use with this app" instead.
// - `calendar.app.created` (not `calendar.events`, and genuinely not any of the "owned"
//   variants either — verified directly against Google's own scope docs, since guessing wrong
//   here risks another invalid_client-shaped outage the same way the OAuth client id itself did)
//   — per the user's own explicit ask, matching what they actually see in ClickUp: a real,
//   isolated secondary "Siqt" calendar the app creates and owns, showing up as its own calendar
//   in Google Calendar's list, with *zero* API access to any of the user's other calendars —
//   `calendar.events`/`calendar.events.owned` would both still see and be able to edit every
//   existing event on the user's real primary calendar, which is exactly the exposure the user
//   flagged. lib/google/calendarSync.ts creates one such calendar per (user, workspace) pair —
//   not one global calendar — so each workspace's events land on their own separate calendar
//   (`calendars.insert`, stored on UserWorkspaceGoogleCalendar), and does all event
//   list/insert/update/delete against that specific calendar id, never `'primary'`.
export const GOOGLE_EXPORT_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.app.created',
];
