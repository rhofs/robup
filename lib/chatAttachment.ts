// Shared by both message-creation routes (main feed + thread reply) — validates a client-supplied
// attachment payload before it's nested into a ChatMessage.create() call. Only a URL this app's
// own upload route (POST /api/uploads/image, context=chat) could have produced is accepted, never
// an arbitrary client-supplied URL — same "don't trust the client, revalidate server-side" posture
// as the quote-snapshot logic beside it in both routes.
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

// A message carries up to this many — "jeg kan heller ikke sende flere bilder samtidig" (2026-11-16).
// It was one per message until then; the table was one-to-many from the start, so nothing in the
// database changed. The composers enforce the same number (hooks/usePendingAttachments.ts).
export const MAX_CHAT_ATTACHMENTS = 10;

// The attachments of a message being posted. Reads `attachments` (a list), and still the older
// single `attachment`: web changes go live under tabs and phones that are already running the
// previous JavaScript, and those keep sending the old shape until they reload.
export function validateChatAttachments(body: { attachments?: unknown; attachment?: unknown }): ValidatedChatAttachment[] | { error: string } {
  const raw: unknown[] = Array.isArray(body.attachments) ? body.attachments : body.attachment != null ? [body.attachment] : [];
  if (raw.length > MAX_CHAT_ATTACHMENTS) return { error: `Too many attachments (max ${MAX_CHAT_ATTACHMENTS})` };
  const valid: ValidatedChatAttachment[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const a = validateChatAttachment(r);
    if (!a || seen.has(a.url)) continue;
    seen.add(a.url);
    valid.push(a);
  }
  return valid;
}

// Rows for a nested create, in the order they were attached. The table has no position column and
// rows created in one statement share a timestamp, so each gets its own millisecond; reads sort by
// it (CHAT_ATTACHMENTS_IN_ORDER). That keeps the order without a migration.
export function chatAttachmentRows(attachments: ValidatedChatAttachment[], now = Date.now()) {
  return attachments.map((a, i) => ({ ...a, createdAt: new Date(now + i) }));
}

export const CHAT_ATTACHMENTS_IN_ORDER = { orderBy: { createdAt: 'asc' as const } };
