// Hocuspocus document-name convention for a chat channel's live-signal room — mirrors
// presenceRoom.ts exactly. Carries zero real Yjs content (see server/collabServer.ts's
// onLoadDocument/onStoreDocument early-return for these names); it exists purely so a client can
// watch "something changed in this channel" and go refetch via the normal REST endpoint. Shared
// by client and server so both ever agree on the exact name and its prefix.
export const CHAT_ROOM_PREFIX = 'chat:';

export function chatDocumentName(channelId: string): string {
  return `${CHAT_ROOM_PREFIX}${channelId}`;
}

export function isChatDocumentName(documentName: string): boolean {
  return documentName.startsWith(CHAT_ROOM_PREFIX);
}

export function channelIdFromChatDocumentName(documentName: string): string {
  return documentName.slice(CHAT_ROOM_PREFIX.length);
}
