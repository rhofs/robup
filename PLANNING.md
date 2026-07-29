# RobUp — Planning & Progress

_Last updated: 2026-07-29_

RobUp is a ClickUp-style task manager: Next.js 16 (App Router, Turbopack) + Prisma/SQLite + Zustand. Paused for a while in favor of Huly, now being actively picked back up.

## What's built and working

**Hierarchy:** Workspace > Space > Folder (nested, unlimited depth, optional) > List > Task > Subtask. A List can live directly under a Space with no folder.

**Tasks (list view):**
- Sortable/resizable/reorderable columns (Name, Status, Assignee, dates, custom fields), persisted in `localStorage`.
- Custom fields, per-space statuses, assignees, archive/restore, bulk select + move/archive/delete.
- Task detail modal: subtasks table, named docs with autosave, comments/activity feed (collapsible, animated in/out), timeframe (start/due + time-of-day).
- Sidebar: recursive Folder/List tree (`components/FolderTree.tsx`) with inline create/rename/delete, drag-and-drop reparenting (drag a List/Folder onto another Folder to nest it, onto the Space header to un-nest).

**Calendar view** (`components/calendar/`):
- Month / Week / Day granularity, Gantt-style bars with lane assignment so a task keeps the same lane across week breaks.
- Drag to reschedule: move (preserves duration) and resize-from-either-edge (works even on tasks that only have one of start/due set — stretching creates the missing date).
- Cross-week-row dragging via a live "ghost" preview (cursor-based day mapping), not just single-row dragging.
- ISO week numbers, hover "+" quick-add per day, header "+ New task" button.
- Task creation is a required dialog (`components/CreateTaskModal.tsx`): Space and List must both be chosen explicitly — no "unsorted" fallback. Start/due date + time editable there too.
- **Calendar has its own sidebar mode**: multi-select filter (checkboxes, tri-state at any folder depth) instead of the Tasks tab's single-selection navigation. Same `FolderTree` component, different mode.

**Navigation:** Huly-style narrow icon rail (Tasks / Calendar) to the left of the sidebar, replacing the old inline List/Calendar toggle.

**Visual design:** Restyled to match Huly's look — neutral gray (`neutral-*`, not `slate-*`, which has a blue undertone) for backgrounds/active states, blue reserved for actual buttons and "this is selected" text/checkboxes, sharper corners throughout (`rounded` default, `rounded-full` only for circular avatars/dots/checkboxes), custom thin scrollbar styling.

## Today's session

1. Fixed the calendar/UI color pass from a previous session: backgrounds were still reading as blue because `slate` isn't a neutral gray — swapped to `neutral-*` for chrome; reverted checkboxes back to blue (per user preference) with the associated label text also turning blue when checked/active, matching Huly's own pattern.
2. Fixed calendar drag-resize so a task with only a start OR only a due date can still be stretched into a range (previously the resize handles were hidden, and even after showing them the commit logic silently no-op'd on the missing field).
3. Built the whole **nested folders** feature end-to-end:
   - Prisma schema: `Folder` is now self-referential (`parentId`, unlimited depth) with cascading delete; `List`/`Folder` gained an `order` field.
   - New `app/api/folders/` routes (POST/PATCH/DELETE); extended `app/api/lists/*` and `app/api/workspaces` for `folderId`/`parentId`/`order`.
   - `store/useTaskStore.ts`: `HierarchyFolder`/`HierarchyList` types, `createFolder`/`renameFolder`/`moveFolder`/`deleteFolder`/`moveList` actions.
   - `lib/folderTree.ts`: pure tree helpers (`getChildFolders`, `getListsIn`, `collectListIdsUnder` — recursive, powers the calendar filter's tri-state checkboxes at any depth — and `isDescendantOf`, a cycle guard for drag-reparenting).
   - `components/FolderTree.tsx`: recursive sidebar tree, replacing the old flat `space.lists.map(...)`.
   - Drag-and-drop reparenting shares the *same* top-level `DndContext` used for task-dragging (see bug note below) — dispatches on an id prefix (`folder-drag:`/`list-drag:` vs a bare task id).

## Next steps / not built yet

- Fine-grained drag-to-*reorder* among siblings (position within the same folder) — current drag only reparents; new/moved items append to the end. Explicitly scoped out of today's pass, not forgotten.
- Folder expand/collapse state is per-mount only (not persisted to `localStorage` like column widths are).
- No task-drop-onto-folder behavior in the calendar/sidebar (dropping a *task* — not a list/folder — onto a Folder row does nothing; only dropping onto a List or the Space header does).

## Known bugs / things to remember

- **dnd-kit gotcha**: `useDraggable`/`useDroppable` bind to the *nearest ancestor* `DndContext` by React-tree position, not by id-naming intent. A second `DndContext` nested inside the existing task-drag one silently stole its `space:`/`list:` droppable targets instead of coexisting. Fix: one shared `DndContext`, dispatch in `onDragEnd` by inspecting the dragged id's prefix. If a future feature wants "its own" drag scope, it needs to either dispatch through the existing context or live in a part of the tree the existing context doesn't wrap.
- Tailwind's `slate-*` palette has a real blue undertone — don't reach for it when the ask is "neutral gray." Use `neutral-*`.
- Minor leftover from today's regression testing: the seed task "Test" got moved from **Backend Sprint & API** to **Frontend Sprint** while verifying that dragging a task onto a sidebar list still works after the DnD refactor. Harmless, easy to move back if it bugs you.
- This machine occasionally leaves a lingering `next dev` process holding the Prisma query-engine DLL locked (breaks `prisma generate` with `EPERM`). If that happens, find the PID from the "port already in use" message and `taskkill /PID <pid> /F` before retrying.
