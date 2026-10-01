"use client";

import { useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  List as ListIcon,
  FileText,
  Plus,
} from "lucide-react";
import {
  useTaskStore,
  type HierarchySpace,
  type HierarchyFolder,
  type HierarchyList,
} from "../../store/useTaskStore";
import { getBoardDocsIn, getListsIn } from "../../lib/folderTree";
import { archivedLast } from "../../lib/archivedLast";
import { FOLDER_ICON_MAP } from "../FolderTree";
import { hapticTap } from "../../lib/haptics";

// The Spaces list shared by Home and Office.
//
// It exists because the first version of both screens was flat: a Space was a row, and tapping it
// left the screen entirely. That is a real loss against the tree it replaced — "jeg får ikke åpne
// opp sånn som jeg fikk før" — because reaching one List meant a full page change, and coming back
// put you at the top with everything shut again.
//
// So a Space row now does two different things depending on where it is tapped: the chevron opens
// it in place, the name goes into it. Expanding in place is the common case (find a List, open it)
// and it never leaves the screen, so Back keeps its meaning. This is not the old tree — it is two
// levels deep and has no drag, rename or reordering — but it is the part of the tree that was
// actually being used for navigation.
//
// Long-press opens the same Space menu as a right-click on desktop, which is how a Space gets
// renamed or deleted. Without it, a Space created here could not be removed from here — reported
// after creating a test Space and finding no way to get rid of it.
//
// Docs are listed too, where the desktop sidebar has them (a Space's top level and each Folder — the
// same getBoardDocsIn), and every Space and Folder has a quiet "+" to make a List, Folder (Spaces only)
// or Doc right here, named inline. Neither existed: "det ikke er noen måte å lage list/folders/docs i
// spaces, hverken til office eller me. Ser fortsatt ikke docs i spaces på mobil."
type CreateKind = "list" | "folder" | "doc";
type CreateTarget = { spaceId: string; folderId: string | null };

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

type Props = {
  spaces: HierarchySpace[];
  // Which rows are open, owned by the page rather than by this component.
  //
  // It lived here first, and collapsed every time you tapped anything: navigating unmounts this
  // list, and the push layer renders a second instance of it that started life with its own empty
  // Set — so the screen you were leaving visibly shut itself the instant the animation began, and
  // coming back put you at the top again. Reported as "spaces og folders lukker seg i det jeg
  // trykker". Two instances of one screen have to read one state.
  openSpaceIds: Set<string>;
  openFolderIds: Set<string>;
  onToggleSpace: (spaceId: string) => void;
  onToggleFolder: (folderId: string) => void;
  emptyText: string;
  onSelectSpace: (spaceId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSpaceMenu: (x: number, y: number, space: HierarchySpace) => void;
  // Folders and Lists get the same long-press menu Spaces already had. Without them this list could
  // create things it could not rename or delete — reported as "kan endre navn på spaces i home, men
  // ikke lists".
  onFolderMenu: (x: number, y: number, folder: HierarchyFolder) => void;
  onListMenu: (
    x: number,
    y: number,
    list: HierarchyList,
    spaceId: string
  ) => void;
  onSelectDoc: (spaceId: string, docId: string) => void;
};

export default function ContextSpaceList({
  spaces,
  emptyText,
  openSpaceIds,
  openFolderIds,
  onToggleSpace,
  onToggleFolder,
  onSelectSpace,
  onSelectList,
  onSpaceMenu,
  onFolderMenu,
  onListMenu,
  onSelectDoc,
}: Props) {
  const createList = useTaskStore((s) => s.createList);
  const createFolder = useTaskStore((s) => s.createFolder);
  const createSpaceDoc = useTaskStore((s) => s.createSpaceDoc);
  // Which Space/Folder's "+" choices are showing, and then which kind is being named.
  const [menuFor, setMenuFor] = useState<CreateTarget | null>(null);
  const [naming, setNaming] = useState<
    (CreateTarget & { kind: CreateKind }) | null
  >(null);
  const [nameDraft, setNameDraft] = useState("");
  const sameTarget = (
    a: CreateTarget | null,
    spaceId: string,
    folderId: string | null
  ) => !!a && a.spaceId === spaceId && a.folderId === folderId;

  const commitName = async () => {
    const target = naming;
    const name = nameDraft.trim();
    setNaming(null);
    setNameDraft("");
    if (!target || !name) return;
    hapticTap();
    if (target.kind === "list")
      await createList(target.spaceId, name, target.folderId);
    else if (target.kind === "folder")
      await createFolder(target.spaceId, name, target.folderId);
    else {
      // A new Doc opens straight away — there is nothing to see in an empty one from the list.
      const doc = await createSpaceDoc(target.spaceId, null, {
        title: name,
        boardFolderId: target.folderId,
      });
      if (doc) onSelectDoc(target.spaceId, doc.id);
    }
  };

  // The "+" beside a Space or Folder. Opens its choices; the Space/Folder is opened too, so what is
  // made appears in view.
  const plusButton = (
    spaceId: string,
    folderId: string | null,
    isOpen: boolean,
    open: () => void
  ) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        hapticTap();
        if (!isOpen) open();
        setNaming(null);
        setMenuFor((cur) =>
          sameTarget(cur, spaceId, folderId) ? null : { spaceId, folderId }
        );
      }}
      aria-label="Add"
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
        sameTarget(menuFor, spaceId, folderId)
          ? "bg-blue-500/15 text-blue-400"
          : "text-neutral-600 active:bg-neutral-800"
      }`}
    >
      <Plus className="w-4 h-4" strokeWidth={1.75} />
    </button>
  );

  // The choices under a "+", then the name field for the one picked.
  const createRow = (spaceId: string, folderId: string | null) => {
    if (sameTarget(naming, spaceId, folderId) && naming) {
      const label =
        naming.kind === "list"
          ? "List"
          : naming.kind === "folder"
          ? "Folder"
          : "Doc";
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void commitName();
          }}
          className="px-1 py-1"
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            // Blur commits, as the New space field does: dismissing the keyboard is the likeliest way
            // out, and losing the typed name to it would read as the button not working.
            onBlur={() => void commitName()}
            placeholder={`${label} name`}
            className="w-full h-10 px-3 rounded-xl bg-neutral-800/70 text-[16px] text-app-strong placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </form>
      );
    }
    if (!sameTarget(menuFor, spaceId, folderId)) return null;
    const kinds: { kind: CreateKind; label: string; Icon: typeof ListIcon }[] =
      [
        { kind: "list", label: "List", Icon: ListIcon },
        ...(folderId === null
          ? [{ kind: "folder" as const, label: "Folder", Icon: FolderIcon }]
          : []),
        { kind: "doc", label: "Doc", Icon: FileText },
      ];
    return (
      <div className="flex gap-1.5 px-1 py-1.5">
        {kinds.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            onClick={() => {
              hapticTap();
              setMenuFor(null);
              setNameDraft("");
              setNaming({ spaceId, folderId, kind });
            }}
            className="flex-1 h-9 rounded-xl bg-neutral-800/70 active:bg-neutral-700 flex items-center justify-center gap-1.5 text-[13px] font-medium text-neutral-200 cursor-pointer"
          >
            <Icon className="w-3.5 h-3.5 text-blue-400" /> {label}
          </button>
        ))}
      </div>
    );
  };

  const docRow = (
    spaceId: string,
    doc: { id: string; title: string; color: string | null }
  ) => (
    <button
      key={doc.id}
      onClick={() => onSelectDoc(spaceId, doc.id)}
      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
    >
      <FileText
        className="w-3.5 h-3.5 shrink-0 text-neutral-500"
        style={{ color: doc.color || undefined }}
      />
      <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">
        {doc.title || "Untitled"}
      </span>
    </button>
  );

  // One timer for the whole list: only one finger is ever held at a time, and keeping it here
  // rather than per row means a row that unmounts mid-hold cannot leave a timer running.
  const timerRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const holdHandlers = (open: (x: number, y: number) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      const { clientX, clientY } = e;
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        hapticTap();
        open(clientX, clientY);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (timerRef.current === null) return;
      if (
        Math.abs(e.clientX - startRef.current.x) > LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(e.clientY - startRef.current.y) > LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearTimer();
      }
    },
    onPointerUp: clearTimer,
    onPointerCancel: clearTimer,
    onContextMenu: (e: React.MouseEvent) => {
      // Suppresses the OS text-selection/context menu that a long press would otherwise raise on
      // top of ours.
      e.preventDefault();
    },
  });

  return (
    <>
      {spaces.length === 0 && (
        <p className="px-2 py-3 text-xs text-neutral-500">{emptyText}</p>
      )}
      {[...spaces].sort(archivedLast).map((space) => {
        const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
        const open = openSpaceIds.has(space.id);
        return (
          <div
            key={space.id}
            className={space.archived ? "opacity-55" : undefined}
          >
            {/* Tapping the row OPENS THE SPACE IN PLACE. It used to navigate, with a separate
                chevron for expanding, and that was reported twice as the same bug — "det ikke åpner
                seg, det bare kommer inn i en ny". A row that looks like a folder should behave like
                one; going into the Space is the rarer thing, so it moved to its own entry inside. */}
            <div className="w-full flex items-center gap-1 rounded-lg transition hover:bg-neutral-800/60">
              <button
                onClick={() => {
                  // A long press that already opened the menu still produces a click on release —
                  // swallow exactly that one rather than also acting behind the menu.
                  if (firedRef.current) {
                    firedRef.current = false;
                    return;
                  }
                  hapticTap();
                  onToggleSpace(space.id);
                }}
                {...holdHandlers((x, y) => onSpaceMenu(x, y, space))}
                className="min-w-0 flex-1 flex items-center gap-3 px-2 py-2.5 rounded-lg text-left cursor-pointer"
              >
                {/* text-white, not text-app-strong — the tile is filled with the Space's own colour,
                    and that token follows the neutral scale into near-black in light mode. */}
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: space.color || "#6366f1" }}
                >
                  {Icon ? (
                    <Icon className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs font-bold">
                      {space.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">
                  {space.name}
                </span>
                <span className="shrink-0 text-neutral-600">
                  {open ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </span>
              </button>
              {!space.archived &&
                plusButton(space.id, null, open, () => onToggleSpace(space.id))}
            </div>

            {open && (
              <div className="ml-5 pl-3 border-l border-neutral-800 space-y-0.5">
                {/* No "Open this Space" entry. There was one, for a day: expanding shows the
                    Lists, and the Space's own board was a separate destination below them. The user
                    read that as the same action offered twice — "vi har jo allerede åpnet spacen ved
                    å utvide den" — and he is right that it made every Space one row taller for
                    something almost nobody wants from here. The Space board is still reachable from
                    the Spaces tree; this list is for finding a List. */}
                {createRow(space.id, null)}
                {space.folders.length === 0 &&
                  getListsIn(space, null).length === 0 &&
                  getBoardDocsIn(space, null).length === 0 && (
                    <p className="px-2 py-2 text-[11px] text-neutral-600">
                      Empty space.
                    </p>
                  )}
                {/* Top-level folders only, and one level of them. Lists carry folderId and folders
                    carry parentId, so the real structure nests arbitrarily deep — but this is a
                    way to reach a List, not a replacement for the tree, and a phone-width list that
                    indents four times over stops being one. Anything deeper is still reachable by
                    opening the Space itself. */}
                {space.folders
                  .filter((f) => f.parentId === null)
                  .map((folder) => {
                    const folderOpen = openFolderIds.has(folder.id);
                    return (
                      <div key={folder.id}>
                        <div className="flex items-center">
                          <button
                            onClick={() => {
                              if (firedRef.current) {
                                firedRef.current = false;
                                return;
                              }
                              hapticTap();
                              onToggleFolder(folder.id);
                            }}
                            {...holdHandlers((x, y) =>
                              onFolderMenu(x, y, folder)
                            )}
                            className="min-w-0 flex-1 flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                          >
                            {folderOpen ? (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                            )}
                            <FolderIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                            <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">
                              {folder.name}
                            </span>
                          </button>
                          {!space.archived &&
                            plusButton(space.id, folder.id, folderOpen, () =>
                              onToggleFolder(folder.id)
                            )}
                        </div>
                        {folderOpen && (
                          <div className="ml-4 pl-3 border-l border-neutral-800 space-y-0.5">
                            {createRow(space.id, folder.id)}
                            {space.lists.filter(
                              (l) =>
                                l.folderId === folder.id &&
                                !l.archived &&
                                !l.docId
                            ).length === 0 &&
                              getBoardDocsIn(space, folder.id).length === 0 && (
                                <p className="px-2 py-1.5 text-[11px] text-neutral-600">
                                  Empty folder.
                                </p>
                              )}
                            {space.lists
                              .filter(
                                (l) =>
                                  l.folderId === folder.id &&
                                  !l.archived &&
                                  !l.docId
                              )
                              .map((list) => (
                                <button
                                  key={list.id}
                                  onClick={() => {
                                    if (firedRef.current) {
                                      firedRef.current = false;
                                      return;
                                    }
                                    onSelectList(space.id, list.id);
                                  }}
                                  {...holdHandlers((x, y) =>
                                    onListMenu(x, y, list, space.id)
                                  )}
                                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                                >
                                  <ListIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                                  <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">
                                    {list.name}
                                  </span>
                                </button>
                              ))}
                            {getBoardDocsIn(space, folder.id).map((d) =>
                              docRow(space.id, d)
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {space.lists
                  .filter((l) => l.folderId === null && !l.archived && !l.docId)
                  .map((list) => (
                    <button
                      key={list.id}
                      onClick={() => {
                        if (firedRef.current) {
                          firedRef.current = false;
                          return;
                        }
                        onSelectList(space.id, list.id);
                      }}
                      {...holdHandlers((x, y) =>
                        onListMenu(x, y, list, space.id)
                      )}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left cursor-pointer hover:bg-neutral-800/60"
                    >
                      <ListIcon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                      <span className="min-w-0 flex-1 text-[13px] text-neutral-300 truncate">
                        {list.name}
                      </span>
                    </button>
                  ))}
                {getBoardDocsIn(space, null).map((d) => docRow(space.id, d))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
