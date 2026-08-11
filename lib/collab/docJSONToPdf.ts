type Mark = { type: string };
type PMNode = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number; kind?: string; id?: string; label?: string };
  content?: PMNode[];
};

const BODY_SIZE = 11;
const H1_SIZE = 20;
const H2_SIZE = 15;
const LIST_INDENT = 18;

function fontFor(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

// Inline leaves -> {text, bold, italic} runs. Mentions render as their plain label — same
// simplification lib/collab/docJSONToGoogleRequests.ts makes, since neither PDF nor Google Docs
// has an equivalent of this app's internal clickable-entity concept.
function inlineRuns(nodes: PMNode[] = [], baseBold: boolean): { text: string; bold: boolean; italic: boolean }[] {
  return nodes
    .map((node) => {
      const marks = node.marks ?? [];
      const bold = baseBold || marks.some((m) => m.type === 'bold');
      const italic = marks.some((m) => m.type === 'italic');
      let text = '';
      if (node.type === 'text') text = node.text ?? '';
      else if (node.type === 'mention' && node.attrs?.label) text = node.attrs.label;
      return { text, bold, italic };
    })
    .filter((run) => run.text);
}

function writeLine(
  doc: PDFKit.PDFDocument,
  inline: PMNode[] | undefined,
  opts: { size: number; bold: boolean; indent: number; marker?: string }
) {
  const runs = inlineRuns(inline, opts.bold);
  if (opts.marker) runs.unshift({ text: opts.marker, bold: false, italic: false });
  if (runs.length === 0) {
    doc.font('Helvetica').fontSize(opts.size).text('', { indent: opts.indent });
    return;
  }
  runs.forEach((run, i) => {
    doc.font(fontFor(run.bold, run.italic)).fontSize(opts.size);
    doc.text(run.text, { continued: i < runs.length - 1, indent: i === 0 ? opts.indent : undefined });
  });
}

function renderBlock(doc: PDFKit.PDFDocument, node: PMNode, depth: number) {
  if (node.type === 'heading') {
    const level = node.attrs?.level ?? 1;
    writeLine(doc, node.content, { size: level === 1 ? H1_SIZE : H2_SIZE, bold: true, indent: depth * LIST_INDENT });
    doc.moveDown(0.5);
    return;
  }
  if (node.type === 'paragraph') {
    writeLine(doc, node.content, { size: BODY_SIZE, bold: false, indent: depth * LIST_INDENT });
    doc.moveDown(0.4);
    return;
  }
  if (node.type === 'subpagesIndex') {
    // Atom block, no static representation of a live table — an honest placeholder rather than
    // silently contributing nothing (the generic child-recursing fallback below would, since this
    // node has no `content`).
    writeLine(doc, undefined, { size: BODY_SIZE, bold: true, indent: depth * LIST_INDENT, marker: '[Subpages]' });
    doc.moveDown(0.4);
    return;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    (node.content ?? []).forEach((item, index) => {
      const marker = node.type === 'orderedList' ? `${index + 1}. ` : '• ';
      const blocks = item.content ?? [];
      blocks.forEach((block, i) => {
        if (i === 0 && (block.type === 'paragraph' || block.type === 'heading')) {
          writeLine(doc, block.content, { size: BODY_SIZE, bold: false, indent: (depth + 1) * LIST_INDENT, marker });
          doc.moveDown(0.2);
        } else {
          renderBlock(doc, block, depth + 1);
        }
      });
    });
    doc.moveDown(0.2);
    return;
  }
  (node.content ?? []).forEach((child) => renderBlock(doc, child, depth));
}

// Same recursive-descent shape as lib/collab/docJSONToPlainText.ts, but issues pdfkit draw calls
// instead of building a string — headings get size/weight, lists get an indent + marker per
// listItem (recursing for nested lists), inline bold/italic switch between the four standard
// PDF fonts pdfkit bundles (no font asset needed).
export function writeDocToPdf(doc: PDFKit.PDFDocument, json: { content?: PMNode[] }) {
  doc.font('Helvetica').fontSize(BODY_SIZE);
  (json.content ?? []).forEach((node) => renderBlock(doc, node, 0));
}
