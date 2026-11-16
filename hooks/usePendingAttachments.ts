'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadChatFile } from '../lib/uploadChatFile';
import { MAX_CHAT_ATTACHMENTS } from '../lib/chatAttachment';

// The files waiting in a chat composer: picked with the paperclip, dropped on the panel or pasted
// into the message, shown as previews, uploaded only when the message is sent.
//
// It was one file per message, held as a single value in ChatPanel and again in ChatThreadPanel.
// "Jeg kan heller ikke sende flere bilder samtidig, samt selecte fler i select browsern"
// (2026-11-16): it is a list now, and it lives here so the main feed and a thread cannot drift
// apart again — the two copies had already done so once, over mentions.

// Client-side mirror of app/api/uploads/image/route.ts's own two allowlists/caps — rejects
// obviously bad picks before ever hitting the network; the route re-validates both independently
// regardless (this is purely a faster/friendlier failure for the composer, not the real gate).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/quicktime',
]);

export function validatePickedFile(file: File): { kind: 'image' | 'file' } | { error: string } {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) return { error: 'Image is too large (max 8MB)' };
    return { kind: 'image' };
  }
  if (ALLOWED_FILE_TYPES.has(file.type)) {
    if (file.size > MAX_FILE_BYTES) return { error: 'File is too large (max 20MB)' };
    return { kind: 'file' };
  }
  return { error: 'Unsupported file type' };
}

// previewUrl is a local blob URL, there before any network call; null for a non-image, which has no
// useful thumbnail. `key` only tells two picks of the same file apart in a list.
export type PickedAttachment = { key: number; file: File; kind: 'image' | 'file'; previewUrl: string | null };
export type UploadedAttachment = Awaited<ReturnType<typeof uploadChatFile>>;

const revoke = (items: PickedAttachment[]) => {
  for (const p of items) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
};

export function usePendingAttachments() {
  const [items, setItems] = useState<PickedAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // The list as of right now, for the handlers below. They are called from places that keep the
  // function they were first given (the editor's paste handler), and several can run before the
  // next render — two drops in a row must both see the first one's files when counting to the cap.
  const live = useRef<PickedAttachment[]>([]);
  const nextKey = useRef(1);
  // What has already been uploaded, by file. A send that fails halfway — the fourth of six images
  // on a train — must not upload the first three again when Send is pressed a second time.
  const uploaded = useRef(new WeakMap<File, UploadedAttachment>());

  const commit = useCallback((next: PickedAttachment[]) => {
    live.current = next;
    setItems(next);
  }, []);

  const add = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const room = MAX_CHAT_ATTACHMENTS - live.current.length;
      const accepted: PickedAttachment[] = [];
      const rejected: string[] = [];
      let overCap = 0;
      for (const file of files) {
        const result = validatePickedFile(file);
        if ('error' in result) {
          rejected.push(files.length > 1 ? `${file.name}: ${result.error}` : result.error);
        } else if (accepted.length >= room) {
          overCap++;
        } else {
          accepted.push({ key: nextKey.current++, file, kind: result.kind, previewUrl: result.kind === 'image' ? URL.createObjectURL(file) : null });
        }
      }
      // Say what was left out and why; what could be added still is.
      const problems = [...rejected];
      if (overCap > 0) problems.push(`A message takes up to ${MAX_CHAT_ATTACHMENTS} files — ${overCap} not added`);
      setError(problems.length ? problems.join(' · ') : null);
      if (accepted.length) commit([...live.current, ...accepted]);
    },
    [commit]
  );

  const remove = useCallback(
    (key: number) => {
      revoke(live.current.filter((p) => p.key === key));
      commit(live.current.filter((p) => p.key !== key));
      setError(null);
    },
    [commit]
  );

  // Also called on every change of conversation, where there is usually nothing to clear — hence
  // no new (empty) list, which would re-render the whole panel for nothing.
  const clear = useCallback(() => {
    setError(null);
    if (live.current.length === 0) return;
    revoke(live.current);
    commit([]);
  }, [commit]);

  // Uploads whatever is pending, one at a time and in order, and returns what the message routes
  // want. One at a time on purpose: on a phone the uplink is the limit either way, and it keeps a
  // burst of ten 8MB bodies from arriving at a small server at once. Throws on the first failure.
  const uploadAll = useCallback(async (): Promise<UploadedAttachment[]> => {
    const pending = live.current;
    if (pending.length === 0) return [];
    setUploading(true);
    try {
      const out: UploadedAttachment[] = [];
      for (const p of pending) {
        let done = uploaded.current.get(p.file);
        if (!done) {
          done = await uploadChatFile(p.file);
          uploaded.current.set(p.file, done);
        }
        out.push(done);
      }
      return out;
    } finally {
      setUploading(false);
    }
  }, []);

  // Blob URLs are only good for this tab's lifetime — revoke what is still pending when the
  // composer goes away, so picked-then-abandoned images do not quietly hold memory.
  useEffect(() => {
    const pending = live;
    return () => revoke(pending.current);
  }, []);

  return { items, error, setError, uploading, add, remove, clear, uploadAll };
}
