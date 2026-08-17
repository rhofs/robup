// Shared by both message-creation routes (main feed + thread reply) — validates a client-supplied
// attachment payload before it's nested into a ChatMessage.create() call. Only a URL this app's
// own upload route (POST /api/uploads/image, context=chat) could have produced is accepted, never
// an arbitrary client-supplied URL — same "don't trust the client, revalidate server-side" posture
// as the quote-snapshot logic beside it in both routes. One attachment per message in v1 (matches
// the composer's own single-pending-attachment UI, not the schema's own one-to-many
// ChatAttachment shape).
export type ValidatedChatAttachment = { url: string; fileName: string | null; byteSize: number | null; kind: 'image' | 'file' };

export function validateChatAttachment(raw: unknown): ValidatedChatAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.url !== 'string' || !a.url.startsWith('/uploads/chat/')) return null;
  return {
    url: a.url,
    fileName: typeof a.fileName === 'string' ? a.fileName : null,
    byteSize: typeof a.byteSize === 'number' ? a.byteSize : null,
    // Defaults to 'image' — matches ChatAttachment.kind's own schema default, and keeps any
    // pre-Phase-6.5 client payload (which never sent kind at all) behaving exactly as before.
    kind: a.kind === 'file' ? 'file' : 'image',
  };
}
