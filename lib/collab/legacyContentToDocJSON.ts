import { parseMentions } from '../mentions';

type InlineJSONNode = { type: string; text?: string; attrs?: Record<string, unknown> };

// One-time seed for a Doc's first-ever collaborative open (server/collabServer.ts's
// onLoadDocument, when `Doc.ydoc` is still null). Maps the old plain-text `content` — a `\n`-
// separated string that may contain `@[Label](kind:id)` tokens — onto the minimal paragraph+text+
// mention schema in ./schema.ts: one line -> one paragraph node, mention tokens become proper
// mention nodes within it. Simplest correct reading of "what the <textarea> showed"; no HardBreak
// node needed. `''.split('\n')` yields `['']` -> one empty paragraph, matching a genuinely empty
// doc with no special-casing.
export function legacyContentToDocJSON(content: string) {
  return {
    type: 'doc',
    content: content.split('\n').map((line) => {
      const inline = parseMentions(line).flatMap<InlineJSONNode>((seg) =>
        seg.type === 'text'
          ? seg.value
            ? [{ type: 'text', text: seg.value }]
            : []
          : [{ type: 'mention', attrs: { kind: seg.kind, id: seg.id, label: seg.label } }]
      );
      return inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' };
    }),
  };
}
