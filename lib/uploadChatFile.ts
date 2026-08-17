// Shared by ChatPanel's and ChatThreadPanel's composers — uploads a picked (or dropped) image or
// file to the generalized POST /api/uploads/image route (context=chat) and returns the fields
// postMessage/postThreadReply need to attach it server-side, including the server's own
// authoritative `kind` (never trust the client's own guess for this — the server derives it from
// the file's actual validated MIME type, not the extension/picker path). Throws on failure —
// callers surface the message. Formerly uploadChatImage.ts, before non-image files existed.
export async function uploadChatFile(file: File): Promise<{ url: string; fileName: string; byteSize: number; kind: 'image' | 'file' }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('context', 'chat');
  const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return { url: data.url, fileName: file.name, byteSize: file.size, kind: data.kind === 'file' ? 'file' : 'image' };
}
