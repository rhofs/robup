// A Content-Disposition header for a file named after something a person typed (a doc's title).
//
// A header may only hold Latin-1, and Response throws on anything else — so a doc titled with an en
// dash, a curly apostrophe (what a phone keyboard types for ') or an emoji failed to export at all,
// with a 500. The plain `filename` gets those replaced; `filename*` carries the real name in UTF-8,
// which browsers and the Android app (SiqtDownloadsPlugin) prefer.
export function attachmentDisposition(title: string, ext: string): string {
  const base = title.replace(/[\r\n"\\/:*?<>|]/g, '_').trim().slice(0, 150) || 'Untitled';
  const name = `${base}.${ext}`;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
