# RobUp — Planning & Progress

_Last updated: 2026-07-29_

RobUp is a ClickUp-style task manager: Next.js 16 (App Router, Turbopack) + Prisma/SQLite + Zustand. Paused for a while in favor of Huly, now being actively picked back up.

## What's built and working

**Hierarchy:** Workspace > Space > Folder (nested, unlimited depth, optional) > List > Task > Subtask. A List can live directly under a Space with no folder. Folders (like Spaces) support a custom color + icon via right-click "Edit appearance".

**Tasks (list view):**
- Sortable/resizable/reorderable columns (Name, Status, Assignee, dates, custom fields), persisted in `localStorage`.
- Custom fields, per-space statuses, assignees, archive/restore, bulk select + move/archive/delete.
- Task detail modal: subtasks table, named docs with autosave, comments/activity feed (collapsible, animated in/out), timeframe (start/due + time-of-day). Row-into-modal "magic move" expand animation.
- Sidebar: recursive Folder/List tree (`components/FolderTree.tsx`) with inline create/rename/delete, drag-and-drop reparenting (drag a List/Folder onto another Folder to nest it, onto the Space header to un-nest) with a cursor-following ghost chip, same as task-row dragging.

**Calendar view** (`components/calendar/`):
- Month / Week / Day granularity, Gantt-style bars with lane assignment so a task keeps the same lane across week breaks.
- Drag to reschedule: move (preserves duration) and resize-from-either-edge (works even on tasks that only have one of start/due set — stretching creates the missing date).
- Cross-week-row dragging via a live "ghost" preview (cursor-based day mapping), not just single-row dragging.
- ISO week numbers, hover "+" quick-add per day, header "+ New task" button.
- Task creation is a required dialog (`components/CreateTaskModal.tsx`): Space and List must both be chosen explicitly — no "unsorted" fallback. Start/due date + time editable there too.
- **Calendar has its own sidebar mode**: multi-select filter (checkboxes, tri-state at any folder depth) instead of the Tasks tab's single-selection navigation. Same `FolderTree` component, different mode.

**Navigation:** Huly-style narrow icon rail (Tasks / Planner) to the left of the sidebar, replacing the old inline List/Calendar toggle. (The calendar view is labeled "Planner" in the nav rail, not "Calendar"/"Cal." — internally `activeView` is still `'board' | 'calendar'`.)

**Visual design:** Matches Huly's look — neutral gray (`neutral-*` everywhere, no more `slate-*`) for backgrounds/borders/chrome, blue reserved for actual buttons and "this is selected" text/checkboxes, sharper corners throughout (`rounded` default, `rounded-full` only for circular avatars/dots/checkboxes), custom thin scrollbar styling matched to the same neutral palette. Accent colors (statuses, calendar bars, Space/Folder color dots, user avatars) use a muted/pastel palette (`FIELD_COLOR_CHOICES` in `page.tsx`) rather than raw saturated Tailwind hues. The "Filter Spaces & Lists" checkboxes (Planner sidebar filter mode) use the same soft tinted-border/tinted-bg pill treatment as status badges when checked (`bg-blue-500/20 border-blue-500/60 text-blue-400`, with a lighter `/10`+`/40` tier for the indeterminate "some children checked" state) instead of a flat solid fill.

## Today's session

**Part 1 — four fixes requested after using the app for a bit:**

1. **Finished the neutral-gray color pass** a previous session only started (267 `slate-*` classes were still left in `app/page.tsx` alone, ~140 more across other components — the earlier pass had only touched checkboxes). Did a straight `slate-` → `neutral-` token swap across every component file plus the scrollbar hex colors in `globals.css`; left `blue-*`/`emerald-*`/`red-*`/status-color inline styles untouched.
2. **Fixed the "rows roll down" nav-switching bug.** Root cause: `TaskRow`'s `layoutId={`task-${task.id}`}` and the task modal's matching `layoutId` are what makes a clicked row "grow into" the modal — but Framer Motion matches `layoutId` *globally* (no `LayoutGroup` is used anywhere), so a task visible in two different nav contexts (e.g. "Everything" and its own List) would FLIP-animate between its two screen positions when switching views. Fixed by scoping the `layoutId` string to the current nav context (`task-${activeSpaceId}|${activeListId}-${id}`, or `task-subtasks-${parentId}-${id}` for subtask rows/nested modals) so identical task ids in different views never match, while opening a row into the modal (same nav context) still does.
3. **Added a drag-ghost overlay for Folder/List dragging.** The shared `DndContext`'s single `DragOverlay` only ever rendered something for task drags; dragging a Folder/List only dimmed the source row with no visible cursor-following element. Added `activeDragEntity` state (set in `handleTaskDragStart` by branching on the `folder-drag:`/`list-drag:` id prefix) and a second `DragOverlay` chip for it.
4. **Folder appearance (color + icon).** Mirrors the existing Space "Edit appearance" flow. `Folder` gained nullable `color`/`icon` columns (`prisma db push`, no migrations dir in this project); new `updateFolder` store action + API support; `FolderTree.tsx` exports a small curated icon set (`FOLDER_ICON_CHOICES`/`FOLDER_ICON_MAP` — star/rocket/briefcase/bookmark/flag/layers/target/heart/trophy) and renders it on the folder row; `page.tsx` got a `folderMenu`/`folderEditTarget` context menu + edit modal cloned from the Space one.

**Part 2 — three follow-up Calendar/Planner tweaks:**

5. Renamed the "Cal." nav-rail label to "Planner" (label + tooltip only — `activeView` internally is still `'calendar'`).
6. **Slimmer Gantt bars.** `WeekRow.tsx`'s exported `BAR_H`/`BAR_GAP` (used by both the real bars and the drag-ghost preview in `CalendarView.tsx`) went from 20/6 to 13/3, with bar text dropped to `text-[9px] leading-none` and tighter horizontal padding — noticeably more rows now fit before the "+N more" overflow kicks in, closer to ClickUp's density.
7. **Muted/pastel accent palette.** The 8 `FIELD_COLOR_CHOICES` hexes (and the 4 `DEFAULT_STATUSES` colors, which are a subset) were desaturated ~40% and lightened slightly via an HSL transform, computed to keep white-on-bar text contrast at least as good as before (verified with a relative-luminance contrast check, not just eyeballed). This is the *only* palette source for status colors, Space/Folder color pickers, and new user avatar colors, so the change is automatically consistent everywhere. Existing DB rows (Status/Space/Folder/User) that had one of the old exact hex values were remapped in place with a one-off script so the running dev data reflects it too, not just new picks; `prisma/seed.ts` updated the same way for future reseeds.

Verified in a real browser (Playwright, headless Chromium against the dev server) — all 7 confirmed working, including that the folder color/icon actually persists (checked via a fresh `/api/workspaces` fetch, not just the optimistic UI state).

**Part 3 — checkbox styling + a real Gantt bug:**

8. Softened the "Filter Spaces & Lists" checkboxes (Planner sidebar) to match the status-pill look: tinted translucent background + tinted border + colored checkmark (`bg-blue-500/20 border-blue-500/60 text-blue-400`) instead of a flat solid fill, with a lighter `/10`+`/40` tier for the "some but not all children checked" indeterminate state. Space/Folder/List rows in `page.tsx` and `FolderTree.tsx`.
9. **Fixed tasks vanishing from the Gantt view when dragging another task — twice.** `assignLanes` (`lib/ganttLayout.ts`) recomputed lane assignments for *every* visible task from scratch on every render, sorted by start date — so moving one task re-sorted the whole list and could reshuffle everyone else's lane too, bumping an unrelated task past `MONTH_MAX_LANES`/`WEEK_MAX_LANES` into the hidden "+N more" bucket even though nothing about that task changed.
   - First pass: made lane assignment "sticky" via an optional `previousLanes` map (each task tries to keep its previous lane before falling back to "first free lane"), kept in a `useRef` in `CalendarView.tsx`.
   - That introduced a second, worse bug: a task's preferred lane could get parked arbitrarily high (e.g. lane 8, from having been part of a big pileup) and then *never come back down* even after the pileup cleared, because nothing ever re-checked whether a lower lane had become free — so it stayed hidden past the cap permanently, not just while genuinely crowded. Root cause was a classic sparse-array gotcha too: `Array.prototype.findIndex` visits holes as `undefined`, and `undefined < x` is always `false`, so a hole left behind by a high preferred-lane jump was never treated as reusable.
   - Fixed both for real by adding a compaction pass after the sticky assignment: the lane numbers actually in use get renumbered to a dense `0..k-1` range (preserving relative order) every render. This is a no-op when there's no gap (so it doesn't reintroduce the original reshuffling), but self-heals a stale high lane back down the moment the crowding around it clears.
   - Verified with direct unit-style tests of `assignLanes` in isolation (not just eyeballing the UI): (a) a task with a stale lane-8 preference and only one sibling correctly compacts to lane 0/1 instead of staying hidden, (b) 8 repeated simulated drags on a 6-task pileup keep max lane bounded at 5 (never runs away), (c) dragging one task away and back never moves an unrelated task that still fits its original lane.

## Next steps / not built yet

**Bigger features, not started:**

- **Office tab.** A new top-level nav-rail tab (alongside Tasks/Planner) — scope/design not fleshed out yet, needs a follow-up planning pass before implementation.
- **Docs nesting.** Task docs (`components/*` doc tabs, `Doc` model) are currently a flat per-task list with autosave and `order`. Nesting them (doc-within-doc, or a folder structure like the Space/Folder/List tree) is not designed yet.
- **Real-time collaborative editing** for Docs via Yjs (CRDT) + Tiptap (rich-text editor) + Hocuspocus (sync server/backend). Would replace the current plain-textarea-with-debounced-autosave doc editor. Needs its own backend process (Hocuspocus server) — not just a frontend change.
- **`.ics` calendar feed.** An exportable/subscribable calendar feed (per-Space or per-user) so external calendar apps (Google Calendar, Outlook, Apple Calendar) can subscribe to RobUp task due/start dates. Needs a public, unauthenticated (token-scoped) API route serving iCalendar format.

**Smaller polish items:**

- Fine-grained drag-to-*reorder* among siblings (position within the same folder) — current drag only reparents; new/moved items append to the end. Explicitly scoped out, not forgotten.
- Folder expand/collapse state is per-mount only (not persisted to `localStorage` like column widths are).
- No task-drop-onto-folder behavior in the calendar/sidebar (dropping a *task* — not a list/folder — onto a Folder row does nothing; only dropping onto a List or the Space header does).
- Folder context menu currently only has "Edit appearance" — rename/delete still only live as the hover pencil/trash icons on the row itself, not in the menu.
- `MONTH_MAX_LANES`/`WEEK_MAX_LANES` (in `CalendarView.tsx`) weren't raised even though bars are now thinner — there's headroom to show more simultaneous lanes before overflowing to "+N more" if that's wanted next.

## Known bugs / things to remember

- **dnd-kit gotcha**: `useDraggable`/`useDroppable` bind to the *nearest ancestor* `DndContext` by React-tree position, not by id-naming intent. A second `DndContext` nested inside the existing task-drag one silently stole its `space:`/`list:` droppable targets instead of coexisting. Fix: one shared `DndContext`, dispatch in `onDragEnd` by inspecting the dragged id's prefix. If a future feature wants "its own" drag scope, it needs to either dispatch through the existing context or live in a part of the tree the existing context doesn't wrap.
- **Framer Motion `layoutId` gotcha**: matches globally by default (no `LayoutGroup` in this app) — any two elements sharing a `layoutId` string will FLIP-animate between each other's screen positions even across totally unrelated parts of the tree/different mount lifecycles. If you add a new shared-layout "magic move" animation, scope the id string to whatever makes two instances *actually* the same logical element (see `TaskRow`'s `navScope` prop), not just the same underlying data id.
- Tailwind's `slate-*` palette has a real blue undertone — don't reach for it when the ask is "neutral gray." Use `neutral-*`. (This is now consistent everywhere as of today.)
- This machine occasionally leaves a lingering `next dev` process holding the Prisma query-engine DLL locked (breaks `prisma generate` with `EPERM`). If that happens, find the PID(s) via `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` (look for `next dev`/`start-server.js` command lines under the project path) and stop them before retrying — a plain port-based "port already in use" message doesn't always show up first.
- Turbopack dev-mode cold-compile quirk: the *very first* hit to an API route after the dev server starts (or after a route file changes) can occasionally return a truncated/empty response body, throwing "Unexpected end of JSON input" client-side. Harmless — it resolves itself on the next request once the route module finishes compiling. Don't mistake this for a real persistence bug; verify by hitting the route again.
- Seed/dev data currently has "Ideer" (muted amber, star icon) and "IDeer irl" (muted blue, briefcase icon) set from this session's verification pass — cosmetic only, feel free to reset.
