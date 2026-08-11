// Hocuspocus document-name convention for workspace-scoped "who's online" presence — a separate
// room per workspace, not one shared name for the whole app (an earlier version used a single
// hardcoded constant here, which meant every workspace's presence leaked into every other one —
// closed as part of adding real auth to the sidecar, see server/collabServer.ts's onAuthenticate).
// Shared by client and server so both ever agree on the exact name and its prefix.
export const PRESENCE_ROOM_PREFIX = '__workspace-presence__:';

export function presenceDocumentName(workspaceId: string): string {
  return `${PRESENCE_ROOM_PREFIX}${workspaceId}`;
}

export function isPresenceDocumentName(documentName: string): boolean {
  return documentName.startsWith(PRESENCE_ROOM_PREFIX);
}

export function workspaceIdFromPresenceDocumentName(documentName: string): string {
  return documentName.slice(PRESENCE_ROOM_PREFIX.length);
}
