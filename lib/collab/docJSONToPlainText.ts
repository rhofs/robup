import { buildMentionToken, type MentionKind } from '../mentions';

type ProseMirrorJSONNode = {
  type: string;
  text?: string;
  attrs?: { kind?: MentionKind; id?: string; label?: string };
  content?: ProseMirrorJSONNode[];
};

// The reverse of legacyContentToDocJSON — re-derives the plain-text `Doc.content` mirror from the
// live Tiptap/Yjs document on every persist (server/collabServer.ts's onStoreDocument), so
// components/DocsBrowser.tsx's preview keeps working unmodified. Re-emits `@[Label](kind:id)` via
// the same buildMentionToken every other mention surface uses, so content still looks exactly like
// it does today — not a "cleaned up" rendering.
export function docJSONToPlainText(doc: Record<string, any>): string {
  const typed = doc as ProseMirrorJSONNode;
  const paragraphs = typed.content ?? [];
  return paragraphs
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => {
          if (node.type === 'text') return node.text ?? '';
          if (node.type === 'mention' && node.attrs?.kind && node.attrs.id && node.attrs.label) {
            return buildMentionToken(node.attrs.kind, node.attrs.id, node.attrs.label);
          }
          return '';
        })
        .join('')
    )
    .join('\n');
}
