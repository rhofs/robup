// The files a paste carries, if files are what the person meant to paste.
//
// "Jeg kan ikke copy/paste bilder i chat/rom" (2026-11-16): the chat composer is an editor whose
// schema has text and mentions and nothing else, so a pasted image had nowhere to go and the paste
// did nothing at all — no error, no preview. Attaching by the paperclip and by drag-and-drop both
// worked, which is why it went unnoticed.
//
// A clipboard with a file on it is not always a file paste. Word, Excel and PowerPoint put a
// *picture of the selection* next to the text they copy; attaching that instead of pasting the text
// is the well-known annoyance in other chat apps. Those copies always carry HTML with real text in
// it. A screenshot carries no HTML, and "Copy image" in a browser carries HTML that is only an
// <img>, so "the HTML has text" is what separates the two. Plain text alone does not: a file copied
// in Finder comes with its own file name as text/plain.
export function pastedFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  let files: File[] = Array.from(data.files ?? []);
  if (files.length === 0 && data.items) {
    files = Array.from(data.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
  }
  if (files.length === 0) return [];
  const html = data.getData('text/html');
  if (html && typeof DOMParser !== 'undefined') {
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
    if (text.trim()) return [];
  }
  return files;
}
