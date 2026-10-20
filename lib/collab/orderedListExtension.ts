import { wrappingInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { OrderedList, ORDERED_LIST_MARKER_PATTERN, parsePlainTextOrderedListPaste } from '@tiptap/extension-list';

// Numbered lists written "1)" as well as "1." — "Docs inne i tasks 1) list går ikke til 2) når jeg
// trykker enter" (2026-10-20). Tiptap only turns "1. " into a list, so "1) " stayed a paragraph that
// happened to start with a number, and Enter gave a plain new line instead of "2)". Here both start a
// list, and the list remembers which way it was written (`delimiter`, rendered as data-delimiter and
// drawn by the siqt-paren counter style in app/globals.css), so the next item continues the same way.
//
// One extension for every editor that writes Docs content — the Docs editor, a task's description and
// the server's schema (lib/collab/schema.ts) — so a list made in one reads the same in the others.
// Adding the attribute is a schema change: DOC_SCHEMA_VERSION 4.

type Delimiter = '.' | ')';

const PAREN_FIRST_LINE = new RegExp(`^\\s*(${ORDERED_LIST_MARKER_PATTERN})\\)`);

export const SiqtOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '.',
        parseHTML: (element: HTMLElement) => (element.getAttribute('data-delimiter') === ')' ? ')' : '.'),
        renderHTML: (attributes: { delimiter?: Delimiter }) => (attributes.delimiter === ')' ? { 'data-delimiter': ')' } : {}),
      },
    };
  },

  // The upstream rule, twice: "1. " and "1) ". A new item only joins the list just above it when it
  // carries on that list's numbering and is written the same way.
  addInputRules() {
    const rule = (find: RegExp, delimiter: Delimiter) =>
      wrappingInputRule({
        find,
        type: this.type,
        getAttributes: (match) => ({ start: +match[1], delimiter }),
        joinPredicate: (match, node) =>
          (!node.attrs.type || node.attrs.type === '1') &&
          (node.attrs.delimiter ?? '.') === delimiter &&
          node.childCount + node.attrs.start === +match[1],
      });
    return [rule(/^(\d+)\.\s$/, '.'), rule(/^(\d+)\)\s$/, ')')];
  },

  // Pasted plain text like "1) …\n2) …" becomes a list, as upstream — keeping the ")".
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('siqtOrderedListPaste'),
        props: {
          handlePaste: (view, event) => {
            if (event.clipboardData?.getData('text/html')?.trim()) return false;
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;
            const list = parsePlainTextOrderedListPaste(text);
            if (!list) return false;
            const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
            const delimiter: Delimiter = PAREN_FIRST_LINE.test(firstLine) ? ')' : '.';
            try {
              const node = view.state.schema.nodeFromJSON({ ...list, attrs: { ...(list.attrs ?? {}), delimiter } });
              view.dispatch(view.state.tr.replaceSelectionWith(node));
              return true;
            } catch {
              return false;
            }
          },
        },
      }),
    ];
  },
});

// "1. " or "1) " in plain-text exports (lib/collab/docJSONToPlainText.ts, docJSONToPdf.ts).
export function orderedListMarker(attrs: Record<string, unknown> | undefined, index: number) {
  const start = typeof attrs?.start === 'number' ? attrs.start : 1;
  return `${start + index}${attrs?.delimiter === ')' ? ')' : '.'} `;
}
