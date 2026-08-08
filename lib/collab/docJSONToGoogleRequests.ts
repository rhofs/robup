type Mark = { type: string };
type PMNode = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number; kind?: string; id?: string; label?: string };
  content?: PMNode[];
};

type Run = { text: string; bold: boolean; italic: boolean };
type Line = { runs: Run[]; headingLevel?: number; listType?: 'bullet' | 'ordered' };

// Mentions render as their plain label — same simplification lib/collab/docJSONToPdf.ts makes,
// since Google Docs has no equivalent of this app's internal clickable-entity concept.
function inlineRuns(nodes: PMNode[] = []): Run[] {
  return nodes
    .map((node) => {
      const marks = node.marks ?? [];
      let text = '';
      if (node.type === 'text') text = node.text ?? '';
      else if (node.type === 'mention' && node.attrs?.label) text = node.attrs.label;
      return { text, bold: marks.some((m) => m.type === 'bold'), italic: marks.some((m) => m.type === 'italic') };
    })
    .filter((run) => run.text);
}

// Same recursive-descent shape as the PDF/plain-text walkers, but flattens to one Line per
// paragraph/heading/list-item instead of drawing/joining immediately — Google Docs' batchUpdate
// API works on a flat text buffer + index ranges, so every line needs to exist before we can
// compute those ranges.
function flattenLines(node: PMNode, out: Line[]) {
  if (node.type === 'heading') {
    out.push({ runs: inlineRuns(node.content), headingLevel: node.attrs?.level ?? 1 });
    return;
  }
  if (node.type === 'paragraph') {
    out.push({ runs: inlineRuns(node.content) });
    return;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const listType = node.type === 'orderedList' ? 'ordered' : 'bullet';
    (node.content ?? []).forEach((item) => {
      (item.content ?? []).forEach((block, i) => {
        if (i === 0 && (block.type === 'paragraph' || block.type === 'heading')) {
          out.push({ runs: inlineRuns(block.content), listType });
        } else {
          flattenLines(block, out);
        }
      });
    });
    return;
  }
  (node.content ?? []).forEach((child) => flattenLines(child, out));
}

// Builds the Google Docs API batchUpdate request list: one insertText with the full flat text,
// then updateTextStyle (bold/italic runs), updateParagraphStyle (headings), and
// createParagraphBullets (list items) requests targeting index ranges within that same text.
// Google applies a batchUpdate's requests in array order, so the style requests (which reference
// positions inside the text insertText just created) must come after it in the same call.
// Known simplification: every line — including the last — gets its own trailing newline, which
// can leave one extra blank paragraph at the very end of the exported doc; harmless, not worth
// the extra complexity of special-casing the final line against Google Docs' own implicit
// trailing newline.
export function docJSONToGoogleRequests(json: { content?: PMNode[] }) {
  const lines: Line[] = [];
  (json.content ?? []).forEach((node) => flattenLines(node, lines));
  if (lines.length === 0) lines.push({ runs: [] });

  let text = '';
  let offset = 1; // Google Docs body content starts at index 1.
  const paragraphStyleRequests: any[] = [];
  const bulletRequests: any[] = [];
  const textStyleRequests: any[] = [];

  for (const line of lines) {
    const lineStart = offset;
    for (const run of line.runs) {
      const runStart = offset;
      text += run.text;
      offset += run.text.length;
      const runEnd = offset;
      if (run.bold || run.italic) {
        const fields = [run.bold && 'bold', run.italic && 'italic'].filter(Boolean).join(',');
        textStyleRequests.push({
          updateTextStyle: {
            range: { startIndex: runStart, endIndex: runEnd },
            textStyle: { bold: run.bold || undefined, italic: run.italic || undefined },
            fields,
          },
        });
      }
    }
    text += '\n';
    offset += 1;
    const lineEnd = offset;

    if (line.headingLevel) {
      paragraphStyleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: lineStart, endIndex: lineEnd },
          paragraphStyle: { namedStyleType: line.headingLevel === 1 ? 'HEADING_1' : 'HEADING_2' },
          fields: 'namedStyleType',
        },
      });
    }
    if (line.listType) {
      bulletRequests.push({
        createParagraphBullets: {
          range: { startIndex: lineStart, endIndex: lineEnd },
          bulletPreset: line.listType === 'ordered' ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
    }
  }

  return [{ insertText: { location: { index: 1 }, text } }, ...paragraphStyleRequests, ...bulletRequests, ...textStyleRequests];
}
