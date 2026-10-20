'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import CollabDocEditor from './collab/CollabDocEditor';
import RichDescriptionEditor from './RichDescriptionEditor';
import { descriptionToDocJSON, renderDescriptionPreview } from '../lib/collab/descriptionDoc';
import { useTaskStore } from '../store/useTaskStore';
import type { MentionKind } from '../lib/mentions';

// A task's description as a real Doc — "Få komplett Docs funksjon inne i beskrivelsen i tasks"
// (2026-10-20). Everything a Doc has, because it is one: the same editor, comments, images and files,
// live task lists, "/" blocks, "@" mentions, and two people editing at once. It used to be a single
// HTML field with a lighter editor (RichDescriptionEditor, still used for templates and below as the
// fallback).
//
// The doc (Doc.descriptionTaskId) is made the first time anyone opens the task, starting from the
// description it already had (app/api/tasks/[id]/description-doc). From then on the doc is what is
// edited, and Task.description is a copy of its HTML, sent after each person's own changes, for the
// places that read the field: Google Calendar, the .ics feed, templates, duplicates and "Create next…".

// taskId → its description doc, for this page's lifetime: a task opened again goes straight to the
// editor, without asking first.
const knownDocIds = new Map<string, string>();

const FRAME =
  'rounded-lg border border-transparent hover:border-neutral-800 focus-within:border-blue-500/70 px-3 py-2 -mx-3 cursor-text transition-colors min-h-[60px]';
const PLACEHOLDER = 'Write a description… “/” for blocks, “@” for people, tasks and docs';

export default function TaskDescriptionDoc({
  taskId,
  description,
  spaceId,
  onJump,
}: {
  taskId: string;
  description: string | null;
  spaceId?: string;
  onJump: (kind: MentionKind, id: string) => void;
}) {
  const mirrorDescription = useTaskStore((s) => s.mirrorDescription);
  const optimisticSetDescription = useTaskStore((s) => s.optimisticSetDescription);
  const [docId, setDocId] = useState<string | null>(() => knownDocIds.get(taskId) ?? null);
  const [failed, setFailed] = useState(false);
  // What a new doc starts from: the description as it was when the task was opened.
  const [seedDescription] = useState(description);

  useEffect(() => {
    if (docId) return;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}/description-doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: descriptionToDocJSON(seedDescription) }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((doc: { id: string }) => {
        knownDocIds.set(taskId, doc.id);
        if (!cancelled) setDocId(doc.id);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, docId, seedDescription]);

  // The doc could not be reached or made: the description stays editable as the field it was.
  if (failed && !docId) {
    return <RichDescriptionEditor value={description} onCommit={(html) => optimisticSetDescription(taskId, html)} onJump={onJump} />;
  }

  if (!docId) return <DescriptionPreview description={description} />;

  return (
    <CollabDocEditor
      key={docId}
      docId={docId}
      embedSpaceId={spaceId}
      onJump={onJump}
      placeholder={PLACEHOLDER}
      className="text-xs"
      frameClassName={FRAME}
      previewHtml={description}
      onCommitHtml={(html) => mirrorDescription(taskId, html)}
    />
  );
}

// The description, drawn as the editor will draw it, while its doc is being found.
function DescriptionPreview({ description }: { description: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) renderDescriptionPreview(ref.current, description);
  }, [description]);
  return (
    <div className={`${FRAME} text-xs`}>
      <div className="collab-doc-editor mt-1.5 pointer-events-none" aria-hidden>
        <div ref={ref} className="ProseMirror" />
      </div>
    </div>
  );
}
