type Mark = { type: string; attrs?: Record<string, any> };
type PMNode = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number; kind?: string; id?: string; label?: string; textAlign?: string; src?: string; alt?: string };
  content?: PMNode[];
};

type Run = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  highlightColor?: string;
  fontSize?: number;
  fontFamily?: string;
  link?: string;
};
type Line = { runs: Run[]; headingLevel?: number; listType?: 'bullet' | 'ordered'; textAlign?: string; imageUrl?: string };

// Unlike PDF export (pdfkit only ships 3 built-in families, so it has to round down to the
// closest), Google Docs' weightedFontFamily field accepts any real font name and renders it
// directly — so every curated family in DocFormatPanel.tsx's FONT_FAMILIES round-trips exactly
// here, not just a hardcoded couple. The CSS stack's primary (first) name already *is* that real
// font name; no lookup table needed on this side.
function googleFontFamily(cssFontFamily?: string): string | undefined {
  if (!cssFontFamily) return undefined;
  const primary = cssFontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return primary || undefined;
}

// Google Docs' updateTextStyle color fields want {color: {rgbColor: {red, green, blue}}} with
// 0-1 floats, not hex strings.
function hexToRgbColor(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { color: { rgbColor: { red: r, green: g, blue: b } } };
}

const ALIGN_TO_NAMED: Record<string, string> = {
  left: 'START',
  center: 'CENTER',
  right: 'END',
  justify: 'JUSTIFIED',
};

// Mentions render as their plain label — same simplification lib/collab/docJSONToPdf.ts makes,
// since Google Docs has no equivalent of this app's internal clickable-entity concept.
function inlineRuns(nodes: PMNode[] = []): Run[] {
  return nodes
    .map((node) => {
      const marks = node.marks ?? [];
      const textStyle = marks.find((m) => m.type === 'textStyle')?.attrs;
      const highlight = marks.find((m) => m.type === 'highlight')?.attrs?.color;
      const link = marks.find((m) => m.type === 'link')?.attrs?.href;
      let text = '';
      if (node.type === 'text') text = node.text ?? '';
      else if (node.type === 'mention' && node.attrs?.label) text = node.attrs.label;
      return {
        text,
        bold: marks.some((m) => m.type === 'bold'),
        italic: marks.some((m) => m.type === 'italic'),
        underline: marks.some((m) => m.type === 'underline'),
        strike: marks.some((m) => m.type === 'strike'),
        color: textStyle?.color ?? undefined,
        highlightColor: highlight ?? undefined,
        fontSize: textStyle?.fontSize ? parseInt(textStyle.fontSize, 10) : undefined,
        fontFamily: googleFontFamily(textStyle?.fontFamily),
        link,
      };
    })
    .filter((run) => run.text);
}

// Same recursive-descent shape as the PDF/plain-text walkers, but flattens to one Line per
// paragraph/heading/list-item instead of drawing/joining immediately — Google Docs' batchUpdate
// API works on a flat text buffer + index ranges, so every line needs to exist before we can
// compute those ranges.
function flattenLines(node: PMNode, out: Line[]) {
  if (node.type === 'heading') {
    out.push({ runs: inlineRuns(node.content), headingLevel: node.attrs?.level ?? 1, textAlign: node.attrs?.textAlign });
    return;
  }
  if (node.type === 'paragraph') {
    out.push({ runs: inlineRuns(node.content), textAlign: node.attrs?.textAlign });
    return;
  }
  if (node.type === 'subpagesIndex') {
    // Atom block, no static representation of a live table — an honest placeholder line rather
    // than silently contributing nothing (the generic child-recursing fallback below would).
    out.push({ runs: [{ text: '[Subpages]', bold: true, italic: false, underline: false, strike: false }] });
    return;
  }
  if (node.type === 'image' && node.attrs?.src) {
    // Real image insert, not a placeholder — unlike PDF export, the Google Docs API's own
    // insertInlineImage request just needs a `uri` and fetches it server-side, so this round-trips
    // with no local image-fetching plumbing needed.
    out.push({ runs: [], imageUrl: node.attrs.src });
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
  // Applied last, in descending index order (each insert shifts everything after it by one — the
  // standard "back to front" trick keeps every not-yet-applied index still valid), since
  // insertInlineImage is itself an insert like insertText, not a style request targeting an
  // already-final range the way every other request in this file is.
  const imageInserts: { index: number; uri: string }[] = [];

  for (const line of lines) {
    const lineStart = offset;
    if (line.imageUrl) imageInserts.push({ index: lineStart, uri: line.imageUrl });
    for (const run of line.runs) {
      const runStart = offset;
      text += run.text;
      offset += run.text.length;
      const runEnd = offset;
      const textStyle: Record<string, any> = {};
      const fields: string[] = [];
      if (run.bold) { textStyle.bold = true; fields.push('bold'); }
      if (run.italic) { textStyle.italic = true; fields.push('italic'); }
      if (run.underline) { textStyle.underline = true; fields.push('underline'); }
      if (run.strike) { textStyle.strikethrough = true; fields.push('strikethrough'); }
      if (run.color) { textStyle.foregroundColor = hexToRgbColor(run.color); fields.push('foregroundColor'); }
      if (run.highlightColor) { textStyle.backgroundColor = hexToRgbColor(run.highlightColor); fields.push('backgroundColor'); }
      if (run.fontFamily) { textStyle.weightedFontFamily = { fontFamily: run.fontFamily }; fields.push('weightedFontFamily'); }
      if (run.fontSize) { textStyle.fontSize = { magnitude: run.fontSize, unit: 'PT' }; fields.push('fontSize'); }
      if (run.link) { textStyle.link = { url: run.link }; fields.push('link'); }
      if (fields.length > 0) {
        textStyleRequests.push({
          updateTextStyle: {
            range: { startIndex: runStart, endIndex: runEnd },
            textStyle,
            fields: fields.join(','),
          },
        });
      }
    }
    text += '\n';
    offset += 1;
    const lineEnd = offset;

    if (line.headingLevel || line.textAlign) {
      const paragraphStyle: Record<string, any> = {};
      const fields: string[] = [];
      if (line.headingLevel) {
        paragraphStyle.namedStyleType = line.headingLevel === 1 ? 'HEADING_1' : 'HEADING_2';
        fields.push('namedStyleType');
      }
      if (line.textAlign && ALIGN_TO_NAMED[line.textAlign]) {
        paragraphStyle.alignment = ALIGN_TO_NAMED[line.textAlign];
        fields.push('alignment');
      }
      paragraphStyleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: lineStart, endIndex: lineEnd },
          paragraphStyle,
          fields: fields.join(','),
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

  const sortedImageRequests = imageInserts
    .sort((a, b) => b.index - a.index)
    .map(({ index, uri }) => ({ insertInlineImage: { location: { index }, uri } }));

  return [
    { insertText: { location: { index: 1 }, text } },
    ...paragraphStyleRequests,
    ...bulletRequests,
    ...textStyleRequests,
    ...sortedImageRequests,
  ];
}
