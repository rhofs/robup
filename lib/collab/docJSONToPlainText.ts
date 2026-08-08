import { buildMentionToken, type MentionKind } from '../mentions';

type ProseMirrorJSONNode = {
  type: string;
  text?: string;
  attrs?: { kind?: MentionKind; id?: string; label?: string };
  content?: ProseMirrorJSONNode[];
};

function inlineToText(nodes: ProseMirrorJSONNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text ?? '';
      if (node.type === 'mention' && node.attrs?.kind && node.attrs.id && node.attrs.label) {
        return buildMentionToken(node.attrs.kind, node.attrs.id, node.attrs.label);
      }
      return '';
    })
    .join('');
}

// Recursively walks any block node into one or more plain-text lines — paragraphs/headings
// contribute one line each; bullet/ordered lists walk each listItem's own nested block(s) and
// prefix a marker, so a list/heading block still reads as a readable multi-line snippet in
// components/DocsBrowser.tsx's preview instead of silently going blank. Marks (bold/italic) are
// ignored throughout, same as before — this is a plain-text preview, not a formatted rendering.
function blockToLines(node: ProseMirrorJSONNode): string[] {
  if (node.type === 'paragraph' || node.type === 'heading') {
    return [inlineToText(node.content)];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = node.content ?? [];
    return items.flatMap((item, index) => {
      const lines = (item.content ?? []).flatMap(blockToLines);
      const marker = node.type === 'orderedList' ? `${index + 1}. ` : '- ';
      return lines.length ? lines.map((line, i) => (i === 0 ? `${marker}${line}` : line)) : [marker.trimEnd()];
    });
  }
  return (node.content ?? []).flatMap(blockToLines);
}

// The reverse of legacyContentToDocJSON — re-derives the plain-text `Doc.content` mirror from the
// live Tiptap/Yjs document on every persist (server/collabServer.ts's onStoreDocument), so
// components/DocsBrowser.tsx's preview keeps working unmodified. Re-emits `@[Label](kind:id)` via
// the same buildMentionToken every other mention surface uses, so content still looks exactly like
// it does today — not a "cleaned up" rendering.
export function docJSONToPlainText(doc: Record<string, any>): string {
  const typed = doc as ProseMirrorJSONNode;
  return (typed.content ?? []).flatMap(blockToLines).join('\n');
}
