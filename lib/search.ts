// null when `text` doesn't contain `query` at all; otherwise lower is a better match
// (exact match, then starts-with, then substring anywhere), ties broken by shorter text.
export const scoreMatch = (text: string, query: string): number | null => {
  const t = text.toLowerCase();
  const idx = t.indexOf(query);
  if (idx === -1) return null;
  if (t === query) return 0;
  if (idx === 0) return 1;
  return 2;
};
