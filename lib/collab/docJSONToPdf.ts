type Mark = { type: string; attrs?: Record<string, any> };
type PMNode = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number; kind?: string; id?: string; label?: string; textAlign?: string; alt?: string; src?: string };
  content?: PMNode[];
};

const BODY_SIZE = 11;
const H1_SIZE = 20;
const H2_SIZE = 15;
const LIST_INDENT = 18;

// The editor's font-family choices (DocFormatPanel.tsx) are deliberately a small curated set
// mapped to names that render exactly through this export too, using only pdfkit's 14 built-in
// standard PDF fonts (Helvetica/Times/Courier families) — no embedded font files needed, sidestepping
// the exact __dirname-relative-asset class of bug pdfkit already bit this project with once
// (see PLANNING.md's Known bugs). Anything not recognized falls back to the Helvetica family,
// same as before this feature existed.
// Looked up by the CSS stack's primary (first, before the comma) font name — not loose substring
// matching, which previously miscategorized every sans-serif family as serif, since the string
// "sans-serif" itself contains "serif" as a substring. Keep in sync with DocFormatPanel.tsx's
// FONT_FAMILIES list.
const FONT_CATEGORY_BY_NAME: Record<string, 'serif' | 'monospace' | 'sans'> = {
  arial: 'sans',
  helvetica: 'sans',
  verdana: 'sans',
  tahoma: 'sans',
  'trebuchet ms': 'sans',
  'comic sans ms': 'sans',
  impact: 'sans',
  georgia: 'serif',
  'times new roman': 'serif',
  times: 'serif',
  'palatino linotype': 'serif',
  palatino: 'serif',
  garamond: 'serif',
  'courier new': 'monospace',
  courier: 'monospace',
  'lucida console': 'monospace',
  monaco: 'monospace',
};

function familyCategory(cssFontFamily?: string): 'serif' | 'monospace' | 'sans' {
  if (!cssFontFamily) return 'sans';
  const primary = cssFontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  return FONT_CATEGORY_BY_NAME[primary] ?? 'sans';
}

function fontFor(bold: boolean, italic: boolean, family: 'serif' | 'monospace' | 'sans'): string {
  if (family === 'serif') {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }
  if (family === 'monospace') {
    if (bold && italic) return 'Courier-BoldOblique';
    if (bold) return 'Courier-Bold';
    if (italic) return 'Courier-Oblique';
    return 'Courier';
  }
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

type Run = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  link?: string;
};

// Inline leaves -> style runs. Mentions render as their plain label — same simplification
// lib/collab/docJSONToGoogleRequests.ts makes, since neither PDF nor Google Docs has an
// equivalent of this app's internal clickable-entity concept. color/fontSize/fontFamily all ride
// on the same shared `textStyle` mark (Tiptap's own composition pattern — see lib/collab/schema.ts).
function inlineRuns(nodes: PMNode[] = [], baseBold: boolean): Run[] {
  return nodes
    .map((node) => {
      const marks = node.marks ?? [];
      const bold = baseBold || marks.some((m) => m.type === 'bold');
      const italic = marks.some((m) => m.type === 'italic');
      const underline = marks.some((m) => m.type === 'underline');
      const strike = marks.some((m) => m.type === 'strike');
      const textStyle = marks.find((m) => m.type === 'textStyle')?.attrs;
      const link = marks.find((m) => m.type === 'link')?.attrs?.href;
      let text = '';
      if (node.type === 'text') text = node.text ?? '';
      else if (node.type === 'mention' && node.attrs?.label) text = node.attrs.label;
      return {
        text,
        bold,
        italic,
        underline,
        strike,
        color: textStyle?.color ?? undefined,
        fontSize: textStyle?.fontSize ? parseInt(textStyle.fontSize, 10) : undefined,
        fontFamily: textStyle?.fontFamily ?? undefined,
        link,
      };
    })
    .filter((run) => run.text);
}

function writeLine(
  doc: PDFKit.PDFDocument,
  inline: PMNode[] | undefined,
  opts: { size: number; bold: boolean; indent: number; marker?: string; align?: string }
) {
  const runs = inlineRuns(inline, opts.bold);
  if (opts.marker) runs.unshift({ text: opts.marker, bold: false, italic: false, underline: false, strike: false });
  const align = opts.align === 'center' || opts.align === 'right' || opts.align === 'justify' ? opts.align : undefined;
  if (runs.length === 0) {
    doc.font('Helvetica').fontSize(opts.size).fillColor('black').text('', { indent: opts.indent, align });
    return;
  }
  runs.forEach((run, i) => {
    doc.font(fontFor(run.bold, run.italic, familyCategory(run.fontFamily)));
    doc.fontSize(run.fontSize ?? opts.size);
    doc.fillColor(run.color ?? 'black');
    doc.text(run.text, {
      continued: i < runs.length - 1,
      indent: i === 0 ? opts.indent : undefined,
      align: i === 0 ? align : undefined,
      underline: run.underline || undefined,
      strike: run.strike || undefined,
      link: run.link,
    });
  });
  doc.fillColor('black').fontSize(BODY_SIZE); // reset graphics state so it never bleeds into the next block
}

function renderBlock(doc: PDFKit.PDFDocument, node: PMNode, depth: number) {
  if (node.type === 'heading') {
    const level = node.attrs?.level ?? 1;
    writeLine(doc, node.content, { size: level === 1 ? H1_SIZE : H2_SIZE, bold: true, indent: depth * LIST_INDENT, align: node.attrs?.textAlign });
    doc.moveDown(0.5);
    return;
  }
  if (node.type === 'paragraph') {
    writeLine(doc, node.content, { size: BODY_SIZE, bold: false, indent: depth * LIST_INDENT, align: node.attrs?.textAlign });
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
  if (node.type === 'image') {
    // Placeholder text only, deliberately — pdfkit's doc.image() needs a local Buffer/path, not a
    // remote URL, so embedding the real image would need async URL-fetching threaded through this
    // otherwise-synchronous walker. A separate, larger piece of work if wanted later.
    writeLine(doc, undefined, { size: BODY_SIZE, bold: true, indent: depth * LIST_INDENT, marker: `[Image${node.attrs?.alt ? `: ${node.attrs.alt}` : ''}]` });
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
// listItem (recursing for nested lists), inline bold/italic/underline/strike/color/font-size/
// font-family/link all map onto pdfkit's own native text-drawing options — no new capability
// needed, everything here was already supported by pdfkit itself.
export function writeDocToPdf(doc: PDFKit.PDFDocument, json: { content?: PMNode[] }) {
  doc.font('Helvetica').fontSize(BODY_SIZE).fillColor('black');
  (json.content ?? []).forEach((node) => renderBlock(doc, node, 0));
}
