// What changed in a task's description or one of its Documents, as one line for the task's activity
// log — "kan vi få en mye mer detaljert historikk?" (2026-11-27): a description had been rewritten,
// recoloured and given a file, and the log said only "Oppgave opprettet".
//
// Used by the collab sidecar (server/collabServer.ts), which is where every edit to a Doc lands. It
// compares the text (and the document's structure, for changes that leave the text alone: colour,
// bold, a heading, an image) before and after, and words it as what was added and what was removed:
//   Beskrivelse redigert – la til «Apex Pro TKL …» · fjernet «gammel lenke»
//   Beskrivelse redigert – endret formatering
// Pure, so it can be tested without a sidecar.

const SNIPPET = 60;
const MAX_PARTS = 3;

// "@[Label](kind:id)" mention tokens read as "@Label"; spaces collapsed, line breaks kept (so an
// addition in two paragraphs is quoted as two, not one run across them).
function readable(text: string): string {
  return text
    .replace(/@\[([^\]]*)\]\([a-z]+:[^)]*\)/g, '@$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n[\s]*/g, '\n')
    .trim();
}

function clip(text: string): string {
  return text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1).trimEnd()}…` : text;
}

function words(text: string): string[] {
  return text.split(/(\s+)/).filter((w) => w.length > 0);
}

// The runs of words added and removed between two texts. A word-level LCS for texts of ordinary size;
// for very long ones, the single changed region between the common start and end (still right for the
// usual case of one edit in one place).
export function wordChanges(before: string, after: string): { added: string[]; removed: string[] } {
  const a = words(before);
  const b = words(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > 1_500_000) {
    return { added: midB.length ? [midB.join('')] : [], removed: midA.length ? [midA.join('')] : [] };
  }
  // LCS table over the changed middle only.
  const n = midA.length;
  const m = midB.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const added: string[] = [];
  const removed: string[] = [];
  let addRun: string[] = [];
  let remRun: string[] = [];
  const flush = () => {
    if (addRun.join('').trim()) added.push(addRun.join(''));
    if (remRun.join('').trim()) removed.push(remRun.join(''));
    addRun = [];
    remRun = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      // A lone space between two changed words keeps them in one run; a line break ends it.
      if (/^[ \t]+$/.test(midA[i]) && (addRun.length || remRun.length)) {
        addRun.push(midA[i]);
        remRun.push(midA[i]);
      } else flush();
      i++;
      j++;
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      if (midB[j].includes('\n')) flush();
      else addRun.push(midB[j]);
      j++;
    } else {
      if (midA[i].includes('\n')) flush();
      else remRun.push(midA[i]);
      i++;
    }
  }
  flush();
  return { added, removed };
}

type JSONNode = { type?: string; text?: string; attrs?: unknown; marks?: { type: string; attrs?: unknown }[]; content?: JSONNode[] };

function countNodes(node: JSONNode | null | undefined, type: string): number {
  if (!node) return 0;
  return (node.type === type ? 1 : 0) + (node.content ?? []).reduce((sum, c) => sum + countNodes(c, type), 0);
}

// How the document is formatted, independent of how much plain text it holds: for every kind of mark
// (bold, a colour, a link …), how many characters carry it; and how many blocks of each kind other
// than a plain paragraph (headings, lists, quotes, checkboxes) there are, with their settings. Typing
// plain text leaves this unchanged; colouring, bolding or turning a line into a heading does not.
function formatting(node: JSONNode | null | undefined, out = new Map<string, number>()): Map<string, number> {
  if (!node) return out;
  if (node.type === 'text') {
    for (const m of node.marks ?? []) {
      const key = `mark:${m.type}:${JSON.stringify(m.attrs ?? null)}`;
      out.set(key, (out.get(key) ?? 0) + (node.text?.length ?? 0));
    }
  } else if (node.type && !['doc', 'paragraph', 'hardBreak', 'image'].includes(node.type)) {
    const key = `node:${node.type}:${JSON.stringify(node.attrs ?? null)}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  for (const c of node.content ?? []) formatting(c, out);
  return out;
}

function sameFormatting(a: unknown, b: unknown): boolean {
  const fa = formatting(a as JSONNode);
  const fb = formatting(b as JSONNode);
  if (fa.size !== fb.size) return false;
  for (const [k, v] of fa) if (fb.get(k) !== v) return false;
  return true;
}

// One line describing the change, or null when nothing a person would notice changed.
export function describeDocChange(
  before: { text: string; json?: unknown },
  after: { text: string; json?: unknown }
): string | null {
  const parts: string[] = [];
  const beforeText = readable(before.text);
  const afterText = readable(after.text);
  if (beforeText !== afterText) {
    const { added, removed } = wordChanges(beforeText, afterText);
    const quote = (runs: string[]) =>
      runs
        .slice(0, MAX_PARTS)
        .map((r) => `«${clip(r.trim())}»`)
        .join(', ') + (runs.length > MAX_PARTS ? ` og ${runs.length - MAX_PARTS} til` : '');
    if (added.length) parts.push(`la til ${quote(added)}`);
    if (removed.length) parts.push(`fjernet ${quote(removed)}`);
  }
  if (before.json !== undefined && after.json !== undefined) {
    const imagesBefore = countNodes(before.json as JSONNode, 'image');
    const imagesAfter = countNodes(after.json as JSONNode, 'image');
    if (imagesAfter > imagesBefore) parts.push(imagesAfter - imagesBefore === 1 ? 'la til et bilde' : `la til ${imagesAfter - imagesBefore} bilder`);
    if (imagesAfter < imagesBefore) parts.push(imagesBefore - imagesAfter === 1 ? 'fjernet et bilde' : `fjernet ${imagesBefore - imagesAfter} bilder`);
    // Colour, bold, a heading, a list, a link — alongside new text or on its own.
    if (!sameFormatting(before.json, after.json)) parts.push('endret formatering');
    else if (!parts.length && JSON.stringify(before.json) !== JSON.stringify(after.json)) parts.push('endret formatering');
  }
  return parts.length ? parts.join(' · ') : null;
}
