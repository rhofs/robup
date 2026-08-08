// Reserved Hocuspocus document name for workspace-wide "who's online" presence — a separate room
// from any real Doc (server/collabServer.ts special-cases this name to skip the Doc DB lookup
// entirely, since it carries no persisted content, only ephemeral awareness state). Shared by the
// server and client so both ever agree on the exact name.
export const PRESENCE_DOCUMENT_NAME = '__workspace-presence__';
