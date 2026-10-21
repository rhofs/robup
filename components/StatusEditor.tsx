'use client';

import { closeOnBackdrop } from '../lib/backdrop';
import { useEffect, useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Plus, GripVertical, MoreHorizontal, Info, ChevronDown, Trash2, Pencil, Check, ArrowRight } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import StatusGlyph, { STATUS_ICONS } from './StatusGlyph';
import { useTaskStore, type HierarchyList, type HierarchySpace, type StatusDef } from '../store/useTaskStore';
import { BUILTIN_STATUS_TEMPLATES, type StatusKindName, type StatusTemplateDef, type TemplateStatus } from '../lib/statusTemplates';

// The Edit statuses window, built after ClickUp's "Edit <List> statuses" (the user's screenshot: "sånn
// vil vi ha det"): settings and templates on the left; the statuses on the right in three groups —
// Active, Done, Closed — each row a grip, its circle, its name and a "···"; "Save as template" and
// "Apply changes" at the foot.
//
// Everything here is a draft until "Apply changes" (app/api/spaces/[id]/statuses). That is what lets a
// template replace the whole set, and lets the window ask, before anything is saved, where the tasks of
// a removed status should go — tasks are filed under a status *name*, so a status that disappears
// without that question would strand them.
//
// Opened from a List, it edits that List: "Status type" chooses between inheriting its Space's statuses
// and keeping custom ones of its own (Status.listId). While it inherits, the Space's statuses show
// read-only, and changing them is a separate, explicit step ("Edit <Space> statuses") — applying in a
// List used to change the statuses of every List in the Space, which was reported as a critical bug:
// "når vi endrer custom status i en liste, og applier, så applier han det for hele workspacet"
// (2026-10-13). Opened from a Space (its menu), it edits the Space's statuses.

type Draft = {
  key: string;
  // The saved status this row is — absent for a new one.
  id?: string;
  // The name its tasks are filed under now (the status's name when the window opened, or a built-in
  // default's for a Space that has none of its own yet). Absent for a new row: nothing is filed there.
  origName?: string;
  name: string;
  color: string;
  kind: StatusKindName;
  icon: string | null;
};

const KINDS: { kind: StatusKindName; label: string; info: string }[] = [
  { kind: 'open', label: 'Active', info: 'Still to do. New tasks start in the first Active status.' },
  { kind: 'done', label: 'Done', info: 'Finished, but the task stays in the list — a solid circle.' },
  { kind: 'closed', label: 'Closed', info: 'Picking one checks the task away: it is archived and leaves the list.' },
];

const COLORS = ['#8d97a5', '#618cd1', '#3b82f6', '#31a0b3', '#349f7c', '#9a61d1', '#cb6798', '#cd6565', '#e0803a', '#c89642'];

const kindOf = (s: { isDone?: boolean; isClosed?: boolean }): StatusKindName => (s.isClosed ? 'closed' : s.isDone ? 'done' : 'open');
let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

// Rows for a status set. `keepIds`: they are the saved statuses being edited (a Space's own, or a List's
// own); otherwise they are a starting point — the built-in defaults, or a List's first custom set copied
// from its Space — and only their names carry over (origName: the tasks filed under them follow).
function draftFrom(statuses: StatusDef[] | undefined, fallback: StatusDef[], keepIds: boolean): Draft[] {
  const own = [...(statuses ?? [])].sort((a, b) => a.order - b.order);
  const src = own.length ? own : fallback;
  const ids = keepIds && own.length > 0;
  return src.map((s) => ({
    key: ids ? s.id : newKey(),
    id: ids ? s.id : undefined,
    origName: s.name,
    name: s.name,
    color: s.color,
    kind: kindOf(s),
    icon: s.icon ?? null,
  }));
}

const same = (a: { name: string; color: string; kind: string; icon?: string | null }[], b: typeof a) =>
  a.length === b.length &&
  a.every((x, i) => x.name === b[i].name && x.color === b[i].color && x.kind === b[i].kind && (x.icon ?? null) === (b[i].icon ?? null));

// Draft in the order it is saved: Active, then Done, then Closed, each in its own order.
const ordered = (d: Draft[]) => KINDS.flatMap((k) => d.filter((x) => x.kind === k.kind));

type TemplatesState = { loaded: boolean; templates: StatusTemplateDef[]; defaultTemplate: string | null; canSetDefault: boolean };

export default function StatusEditor({
  space,
  list,
  workspaceId,
  fallback,
  focusNew = false,
  onClose,
}: {
  space: HierarchySpace;
  // The List it was opened from, if any — then it edits that List (see the note at the top).
  list?: HierarchyList;
  workspaceId: string | null;
  // The built-in statuses a Space without its own shows (page.tsx's DEFAULT_STATUSES).
  fallback: StatusDef[];
  focusNew?: boolean;
  onClose: () => void;
}) {
  const applySpaceStatuses = useTaskStore((s) => s.applySpaceStatuses);
  const updateSpace = useTaskStore((s) => s.updateSpace);
  const updateList = useTaskStore((s) => s.updateList);
  const allTasks = useTaskStore((s) => s.tasks);

  // What "Apply" saves: the Space's statuses, or the List's. A List that has its own starts on them;
  // one that inherits starts on "Inherit", showing its Space's.
  const listHadOwn = !!list?.statuses?.length;
  const [target, setTarget] = useState<'space' | 'list'>(list ? 'list' : 'space');
  // "New status" from a List that inherits starts its own set — there is nowhere else to add one.
  const [listCustom, setListCustom] = useState(listHadOwn || (!!list && focusNew));
  const editing = target === 'space' || listCustom;
  // The Space's statuses as rows (read-only while a List inherits, and the base when it goes custom).
  const spaceRows = () => draftFrom(space.statuses, fallback, true);

  // Built once, together: opened from "New status", the window starts with an empty Active row to type
  // in — which, in a List that inherits, means starting its own set.
  const [boot] = useState(() => {
    const extra: Draft | null = focusNew ? { key: newKey(), name: '', color: COLORS[1], kind: 'open', icon: null } : null;
    const init = list ? (listHadOwn ? draftFrom(list.statuses, fallback, true) : draftFrom(space.statuses, fallback, false)) : spaceRows();
    return { init, extra };
  });
  const [initial, setInitial] = useState<Draft[]>(boot.init);
  const [draft, setDraft] = useState<Draft[]>(() => (boot.extra ? [...boot.init, boot.extra] : boot.init));
  const [focusKey, setFocusKey] = useState<string | null>(boot.extra?.key ?? null);
  // The task circle and strike-through belong to what the window edits: opened from a List, that List —
  // its own choice, else its Space's. They used to be the Space's whichever way the window was opened,
  // so changing them in one List changed every List in the Space ("Når jeg endrer på 'Edit statuses' på
  // en list endres det på alle lists i samme space", 2026-10-21).
  const spaceCircle: 'menu' | 'close' = space.checkMode === 'close' ? 'close' : 'menu';
  const spaceStrike = !!space.strikeDone;
  const savedSettings = (t: 'space' | 'list') =>
    t === 'list' && list
      ? { circle: (list.checkMode ?? spaceCircle) === 'close' ? ('close' as const) : ('menu' as const), strike: list.strikeDone ?? spaceStrike }
      : { circle: spaceCircle, strike: spaceStrike };
  const [checkMode, setCheckMode] = useState<'menu' | 'close'>(() => savedSettings(list ? 'list' : 'space').circle);
  const [strikeDone, setStrikeDone] = useState(() => savedSettings(list ? 'list' : 'space').strike);
  const [step, setStep] = useState<'edit' | 'migrate'>('edit');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tpl, setTpl] = useState<TemplatesState>({ loaded: false, templates: [], defaultTemplate: null, canSetDefault: false });
  const [tplMenu, setTplMenu] = useState(false);
  const [defaultMenu, setDefaultMenu] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    fetch(`/api/status-templates?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setTpl({ loaded: true, templates: d.templates ?? [], defaultTemplate: d.defaultTemplate ?? null, canSetDefault: !!d.canSetDefault });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  // The built-in templates are copied into each workspace as its own (deletable) templates the first
  // time they are listed (app/api/status-templates), so once loaded the list is just the workspace's.
  const allTemplates: StatusTemplateDef[] = tpl.loaded ? tpl.templates : BUILTIN_STATUS_TEMPLATES;
  const asTemplate = (d: Draft[]): TemplateStatus[] => ordered(d).map(({ name, color, kind, icon }) => ({ name: name.trim(), color, kind, icon }));
  // What is on screen: the draft, or — while a List inherits — its Space's statuses.
  const shownRows = editing ? draft : spaceRows();
  const current = asTemplate(shownRows);
  const matching = allTemplates.find((t) => same(t.statuses, current));
  const settingsDirty = checkMode !== savedSettings(target).circle || strikeDone !== savedSettings(target).strike;
  // Content, or which saved status sits where (a removed status re-added under the same name is a new
  // status, not the old one).
  const initialKeys = ordered(initial).map((d) => d.key);
  const draftChanged = !same(asTemplate(draft), asTemplate(initial)) || ordered(draft).some((d, i) => d.key !== initialKeys[i]);
  // For a List: whether it switched between inheriting and its own set.
  const typeChanged = target === 'list' && listCustom !== listHadOwn;
  const statusesDirty = typeChanged || (editing && draftChanged);
  const dirty = statusesDirty || settingsDirty;

  // Switching what the window edits. Each switch starts from what is saved for that choice.
  const useCustom = () => {
    if (listCustom) return;
    setListCustom(true);
    // Its own saved set if it had one; else a copy of the Space's to start from.
    const rows = listHadOwn ? draftFrom(list!.statuses, fallback, true) : draftFrom(space.statuses, fallback, false);
    setInitial(listHadOwn ? rows : draftFrom(space.statuses, fallback, false).map((r, i) => ({ ...r, key: rows[i].key })));
    setDraft(rows);
  };
  const useInherit = () => setListCustom(false);
  const editSpaceInstead = () => {
    const rows = spaceRows();
    setTarget('space');
    setInitial(rows);
    setDraft(rows);
    setCheckMode(savedSettings('space').circle);
    setStrikeDone(savedSettings('space').strike);
  };
  const backToList = () => {
    setTarget('list');
    setCheckMode(savedSettings('list').circle);
    setStrikeDone(savedSettings('list').strike);
    const rows = listHadOwn ? draftFrom(list!.statuses, fallback, true) : draftFrom(space.statuses, fallback, false);
    setInitial(rows);
    setDraft(rows);
    setListCustom(listHadOwn);
  };

  const chooseTemplate = (t: StatusTemplateDef) => {
    setTplMenu(false);
    // A template in a List that inherits gives it its own set.
    let base = initial;
    if (target === 'list' && !listCustom) {
      base = listHadOwn ? draftFrom(list!.statuses, fallback, true) : draftFrom(space.statuses, fallback, false);
      setInitial(base);
      setListCustom(true);
    }
    // A status of the same name keeps its identity — and its tasks — instead of being removed and made anew.
    const pool = [...base];
    setDraft(
      t.statuses.map((s) => {
        const i = pool.findIndex((p) => p.name.toLowerCase() === s.name.toLowerCase());
        const prev = i >= 0 ? pool.splice(i, 1)[0] : undefined;
        return { key: prev?.key ?? newKey(), id: prev?.id, origName: prev?.origName, name: s.name, color: s.color, kind: s.kind, icon: s.icon ?? null };
      })
    );
  };

  // The tasks a change here reaches: this List's, or those of the Space's Lists without their own.
  const listIds = new Set(target === 'list' ? [list!.id] : space.lists.filter((l) => !l.statuses?.length).map((l) => l.id));
  // A List going back to inheriting: its own statuses whose names its Space does not have.
  const goingBack = target === 'list' && listHadOwn && !listCustom;
  const goneByInherit = goingBack
    ? draftFrom(list!.statuses, fallback, true).filter((r) => !shownRows.some((sr) => sr.name === r.name))
    : [];
  // Removed statuses, by the name their tasks are filed under — and how many tasks that is, here.
  const removed = (goingBack ? goneByInherit : editing ? initial.filter((i) => i.origName && !draft.some((d) => d.key === i.key)) : []).map((i) => ({
    ...i,
    count: allTasks.filter((t) => listIds.has(t.listId) && t.status === i.origName).length,
  }));
  // The statuses tasks can be moved to.
  const destinations = goingBack ? ordered(shownRows) : ordered(draft);
  const defaultTarget = (r: Draft, list: Draft[]) => (list.find((d) => d.kind === r.kind) ?? list.find((d) => d.kind === 'open') ?? list[0])?.name.trim() ?? '';

  const validate = (): string | null => (editing ? validateRows(draft) : null);

  const apply = async (confirmed: boolean) => {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    const rows = ordered(draft);
    if (!confirmed && removed.some((r) => r.count > 0)) {
      setTargets(Object.fromEntries(removed.map((r) => [r.origName!, defaultTarget(r, destinations)])));
      setStep('migrate');
      return;
    }
    setSaving(true);
    const savesStatuses = target === 'list' ? statusesDirty : statusesDirty || !space.statuses?.length;
    if (savesStatuses) {
      const rename: Record<string, string> = {};
      if (editing) for (const d of rows) if (d.origName && d.origName !== d.name.trim()) rename[d.origName] = d.name.trim();
      for (const r of removed) rename[r.origName!] = targets[r.origName!] ?? defaultTarget(r, destinations);
      const err = await applySpaceStatuses(
        space.id,
        editing ? rows.map((d) => ({ id: d.id, name: d.name.trim(), color: d.color, kind: d.kind, icon: d.icon })) : [],
        rename,
        target === 'list' ? { listId: list!.id, inherit: !listCustom } : undefined
      );
      if (err) {
        setSaving(false);
        setStep('edit');
        return setError(err);
      }
    }
    if (settingsDirty) {
      // A List stores its own choice only where it differs from its Space, so it goes on following the
      // Space in everything it has not chosen.
      if (target === 'list' && list) {
        void updateList(space.id, list.id, {
          checkMode: checkMode === spaceCircle ? null : checkMode,
          strikeDone: strikeDone === spaceStrike ? null : strikeDone,
        });
      } else void updateSpace(space.id, { checkMode, strikeDone });
    }
    onClose();
  };

  const attemptClose = () => {
    if (dirty && !window.confirm('Discard your changes to these statuses?')) return;
    onClose();
  };

  const saveTemplate = async () => {
    const name = tplName.trim();
    if (!name || !workspaceId) return;
    const problem = validate();
    if (problem) return setError(problem);
    const res = await fetch('/api/status-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name, statuses: current }),
    }).catch(() => null);
    if (!res || !res.ok) return setError('Could not save the template.');
    const t = (await res.json()) as StatusTemplateDef;
    setTpl((s) => ({ ...s, templates: [...s.templates, t] }));
    setSaveTplOpen(false);
    setTplName('');
    setNotice(`Saved as template “${t.name}”.`);
  };

  // Editing a status template in place — its name and statuses — instead of deleting it and saving a
  // new one ("så man kan redigere alle typer templates … så man ikke trenger å slette, for så lage ny").
  // While it is open the window shows the template, and the Space/List draft waits untouched.
  const [tplEdit, setTplEdit] = useState<{ id: string; name: string } | null>(null);
  const [tplDraft, setTplDraft] = useState<Draft[]>([]);
  const [tplFocusKey, setTplFocusKey] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);
  const startEditTemplate = (t: StatusTemplateDef) => {
    setTplMenu(false);
    setTplError(null);
    setTplEdit({ id: t.id, name: t.name });
    setTplDraft(t.statuses.map((st) => ({ key: newKey(), name: st.name, color: st.color, kind: st.kind, icon: st.icon ?? null })));
  };
  const saveEditedTemplate = async () => {
    if (!tplEdit) return;
    const name = tplEdit.name.trim();
    if (!name) return setTplError('The template needs a name.');
    const problem = validateRows(tplDraft);
    if (problem) return setTplError(problem);
    const statuses = asTemplate(tplDraft);
    const res = await fetch(`/api/status-templates/${tplEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, statuses }),
    }).catch(() => null);
    if (!res || !res.ok) return setTplError('Could not save the template.');
    setTpl((st) => ({ ...st, templates: st.templates.map((x) => (x.id === tplEdit.id ? { ...x, name, statuses } : x)) }));
    setTplEdit(null);
    setNotice(`Template “${name}” updated.`);
  };

  const deleteTemplate = async (t: StatusTemplateDef) => {
    if (!window.confirm(`Delete the template “${t.name}”? Spaces already using its statuses keep them.`)) return;
    const res = await fetch(`/api/status-templates/${t.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res || !res.ok) return setError('Could not delete the template.');
    setTpl((s) => ({ ...s, templates: s.templates.filter((x) => x.id !== t.id), defaultTemplate: s.defaultTemplate === t.id ? null : s.defaultTemplate }));
  };

  const setDefault = async (id: string | null) => {
    setDefaultMenu(false);
    if (!workspaceId) return;
    const res = await fetch('/api/status-templates/default', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, templateId: id }),
    }).catch(() => null);
    if (!res || !res.ok) return setError('Could not change the default template.');
    setTpl((s) => ({ ...s, defaultTemplate: id }));
  };
  const defaultName = tpl.defaultTemplate ? (allTemplates.find((t) => t.id === tpl.defaultTemplate)?.name ?? 'Standard') : 'Standard (To Do … Done)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-3" {...closeOnBackdrop(attemptClose)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-full max-h-[calc(100dvh-24px)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 h-14 shrink-0 border-b border-neutral-800 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px] text-app-strong truncate">
            {tplEdit ? (
              'Edit status template'
            ) : (
              <>
                Edit <span className="underline decoration-dashed decoration-neutral-600 underline-offset-4">{target === 'list' ? list!.name : space.name}</span> statuses
              </>
            )}
          </h3>
          <button onClick={attemptClose} className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {tplEdit ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
            <div>
              <p className="text-[12px] text-neutral-400 mb-2">Template name</p>
              <input
                value={tplEdit.name}
                onChange={(e) => setTplEdit({ ...tplEdit, name: e.target.value })}
                className="w-full max-w-sm bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-[13px] text-app-strong focus:outline-none focus:border-blue-500"
              />
            </div>
            <StatusSections draft={tplDraft} setDraft={setTplDraft} focusKey={tplFocusKey} setFocusKey={setTplFocusKey} />
          </div>
        ) : step === 'migrate' ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div>
              <p className="text-[14px] font-semibold text-app-strong">Move tasks from removed statuses</p>
              <p className="text-[12px] text-neutral-500 mt-1">These statuses still have tasks. Choose where those tasks go.</p>
            </div>
            <div className="space-y-2">
              {removed
                .filter((r) => r.count > 0)
                .map((r) => (
                  <div key={r.key} className="flex items-center gap-3 rounded-xl border border-neutral-800 px-3 py-2.5">
                    <StatusGlyph kind={r.kind} color={r.color} icon={r.icon} size={14} />
                    <span className="text-[12px] font-bold uppercase tracking-wide text-neutral-200 truncate">{r.origName}</span>
                    <span className="text-[11px] text-neutral-500 shrink-0">
                      {r.count} task{r.count === 1 ? '' : 's'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-500 shrink-0 ml-auto" />
                    <select
                      value={targets[r.origName!] ?? ''}
                      onChange={(e) => setTargets((t) => ({ ...t, [r.origName!]: e.target.value }))}
                      className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-[12px] text-app-strong focus:outline-none focus:border-blue-500 cursor-pointer max-w-[45%]"
                    >
                      {destinations.map((d) => (
                        <option key={d.key} value={d.name.trim()}>
                          {d.name.trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
            {/* ---- Left: template and settings ---- */}
            <div className="md:w-[250px] shrink-0 md:border-r border-b md:border-b-0 border-neutral-800 p-5 space-y-5 md:overflow-y-auto">
              {/* A List chooses: its Space's statuses, or its own. */}
              {list && target === 'list' && (
                <div>
                  <p className="flex items-center gap-1.5 text-[12px] text-neutral-400 mb-2">
                    Status type
                    <span title="A List can follow its Space's statuses, or have its own that only it uses." className="text-neutral-600 cursor-help">
                      <Info className="w-3 h-3" />
                    </span>
                  </p>
                  {(
                    [
                      [false, `Inherit from Space`],
                      [true, 'Use custom statuses'],
                    ] as const
                  ).map(([custom, label]) => (
                    <button
                      key={label}
                      onClick={custom ? useCustom : useInherit}
                      className="w-full flex items-center gap-2.5 py-1.5 text-left cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          listCustom === custom ? 'border-blue-500' : 'border-neutral-600'
                        }`}
                      >
                        {listCustom === custom && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      </span>
                      <span className={`text-[13px] ${listCustom === custom ? 'text-app-strong' : 'text-neutral-400'}`}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Editing the Space's statuses after starting from a List — a way back. */}
              {list && target === 'space' && (
                <button onClick={backToList} className="text-[12px] text-blue-400 hover:text-blue-300 cursor-pointer">
                  ← Back to {list.name}
                </button>
              )}
              <div>
                <p className="text-[12px] text-neutral-400 mb-2">Status template</p>
                <FloatingPopover
                  open={tplMenu}
                  onClose={() => setTplMenu(false)}
                  panelClassName="w-64 max-h-[60vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
                  anchor={
                    <button
                      onClick={() => setTplMenu((o) => !o)}
                      className="w-[210px] max-w-full h-10 px-3 rounded-lg border border-neutral-700 hover:border-neutral-600 flex items-center justify-between text-[13px] text-app-strong cursor-pointer"
                    >
                      <span className="truncate">{matching?.name ?? 'Custom'}</span>
                      <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
                    </button>
                  }
                >
                  {/* All deletable once loaded — the built-in ones are the workspace's own copies by then. */}
                  <TemplateGroup
                    label="Templates"
                    templates={allTemplates}
                    selected={matching?.id}
                    onPick={chooseTemplate}
                    onDelete={tpl.loaded ? deleteTemplate : undefined}
                    onEdit={tpl.loaded ? startEditTemplate : undefined}
                  />
                  {tpl.loaded && allTemplates.length === 0 && (
                    <p className="px-2 py-1.5 text-[11.5px] text-neutral-500">No templates. Save these statuses as one below.</p>
                  )}
                </FloatingPopover>
              </div>

              <div>
                <p className="text-[12px] text-neutral-400 mb-2">New Spaces start with</p>
                {tpl.canSetDefault ? (
                  <FloatingPopover
                    open={defaultMenu}
                    onClose={() => setDefaultMenu(false)}
                    panelClassName="w-56 max-h-[60vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
                    anchor={
                      <button
                        onClick={() => setDefaultMenu((o) => !o)}
                        className="w-[210px] max-w-full h-10 px-3 rounded-lg border border-neutral-700 hover:border-neutral-600 flex items-center justify-between text-[13px] text-app-strong cursor-pointer"
                      >
                        <span className="truncate">{defaultName}</span>
                        <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
                      </button>
                    }
                  >
                    {/* No template: a new Space has no statuses of its own and shows the standard four. */}
                    <button
                      onClick={() => setDefault(null)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12.5px] text-neutral-200 hover:bg-neutral-800 cursor-pointer"
                    >
                      <span className="flex-1 truncate">Standard (To Do … Done)</span>
                      {!tpl.defaultTemplate && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
                    </button>
                    {allTemplates.map((t) => {
                      const on = tpl.defaultTemplate === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setDefault(t.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12.5px] text-neutral-200 hover:bg-neutral-800 cursor-pointer"
                        >
                          <span className="flex-1 truncate">{t.name}</span>
                          {on && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
                        </button>
                      );
                    })}
                  </FloatingPopover>
                ) : (
                  <p className="text-[13px] text-neutral-300">{defaultName}</p>
                )}
              </div>

              {/* What tapping a task's circle does in this Space — the status menu, or closing at once
                  ("at man kan toggle om man vil ha den 'gamle' stilen"). See Space.checkMode. */}
              <div>
                <p className="text-[12px] text-neutral-400 mb-2">Task circle{target === 'list' && list ? ` in ${list.name}` : ''}</p>
                <div className="flex rounded-lg bg-neutral-800/70 p-0.5 w-[210px] max-w-full">
                  {(['menu', 'close'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setCheckMode(m)}
                      className={`flex-1 h-7 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors ${
                        checkMode === m ? 'bg-neutral-700 text-app-strong' : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {m === 'menu' ? 'Status menu' : 'Close directly'}
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] text-neutral-500 mt-1.5 leading-relaxed">
                  {checkMode === 'close' ? 'A tap closes the task at once (archived).' : 'A tap opens these statuses to pick from.'}
                  {target === 'list' && list && ` Only this List; the rest of ${space.name} keep their own.`}
                </p>
              </div>

              <button onClick={() => setStrikeDone((v) => !v)} className="flex items-center gap-2.5 cursor-pointer text-left">
                <span className={`w-7 h-4 rounded-full p-0.5 transition-colors shrink-0 ${strikeDone ? 'bg-blue-500' : 'bg-neutral-700'}`}>
                  <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${strikeDone ? 'translate-x-3' : ''}`} />
                </span>
                <span className="text-[12px] text-neutral-300">
                  Strike through done tasks <span className="line-through text-neutral-500">like this</span>
                </span>
              </button>
            </div>

            {/* ---- Right: the statuses ---- */}
            <div className="flex-1 min-w-0 p-5 space-y-5 md:overflow-y-auto">
              {!editing ? (
                // A List that inherits: its Space's statuses, read-only. Changing them is its own
                // explicit step, and says what it reaches.
                <>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3.5 space-y-2.5">
                    <p className="text-[12.5px] text-neutral-300 leading-relaxed">
                      <span className="font-semibold text-app-strong">{list!.name}</span> uses the statuses of the Space{' '}
                      <span className="font-semibold text-app-strong">{space.name}</span>. To change them for this List only, choose{' '}
                      <span className="text-app-strong">Use custom statuses</span>.
                    </p>
                    <button onClick={editSpaceInstead} className="text-[12px] text-blue-400 hover:text-blue-300 cursor-pointer">
                      Edit {space.name}&apos;s statuses instead — every List in it that uses them
                    </button>
                  </div>
                  {KINDS.map(({ kind, label }) => {
                    const rows = shownRows.filter((d) => d.kind === kind);
                    if (rows.length === 0) return null;
                    return (
                      <div key={kind}>
                        <p className="text-[12px] text-neutral-400 mb-2">{label}</p>
                        <div className="space-y-1.5">
                          {rows.map((d) => (
                            <div key={d.key} className="flex items-center gap-2.5 h-9 px-3 rounded-lg border border-neutral-800 bg-neutral-900/60">
                              <StatusGlyph kind={d.kind} color={d.color} icon={d.icon} size={16} />
                              <span className="text-[12.5px] font-bold uppercase tracking-wide text-neutral-400">{d.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
              <StatusSections draft={draft} setDraft={setDraft} focusKey={focusKey} setFocusKey={setFocusKey} />
              )}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-neutral-800 px-5 py-3 flex flex-wrap items-center gap-2">
          {tplEdit ? (
            <>
              <p className={`flex-1 min-w-[160px] text-[11.5px] ${tplError ? 'text-red-400' : 'text-neutral-500'}`}>
                {tplError ?? 'Changes the template only — Spaces and Lists already using these statuses keep theirs.'}
              </p>
              <button onClick={() => setTplEdit(null)} className="h-9 px-4 rounded-lg border border-neutral-700 text-[13px] text-app-strong hover:bg-neutral-800 cursor-pointer">
                Cancel
              </button>
              <button onClick={saveEditedTemplate} className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium cursor-pointer">
                Save template
              </button>
            </>
          ) : (
          <>
          <p className={`flex-1 min-w-[160px] text-[11.5px] ${error ? 'text-red-400' : 'text-neutral-500'}`}>
            {error ??
              notice ??
              (step === 'migrate'
                ? ''
                : target === 'space'
                  ? `Applies to every List in ${space.name} that does not use its own statuses.`
                  : listCustom
                    ? `Only ${list!.name} uses these.`
                    : `${list!.name} follows ${space.name}.`)}
          </p>
          {step === 'migrate' ? (
            <>
              <button onClick={() => setStep('edit')} className="h-9 px-4 rounded-lg border border-neutral-700 text-[13px] text-app-strong hover:bg-neutral-800 cursor-pointer">
                Back
              </button>
              <button
                disabled={saving}
                onClick={() => apply(true)}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium cursor-pointer disabled:opacity-50"
              >
                Move tasks and apply
              </button>
            </>
          ) : (
            <>
              <FloatingPopover
                open={saveTplOpen}
                onClose={() => setSaveTplOpen(false)}
                align="right"
                panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-3 space-y-2"
                anchor={
                  <button
                    disabled={!workspaceId}
                    onClick={() => {
                      setTplName((n) => n || `${space.name} statuses`);
                      setSaveTplOpen((o) => !o);
                    }}
                    className="h-9 px-4 rounded-lg border border-neutral-700 text-[13px] text-app-strong hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
                  >
                    Save as template
                  </button>
                }
              >
                <p className="text-[12px] text-neutral-400">Template name</p>
                <input
                  autoFocus
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveTemplate()}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-[13px] text-app-strong focus:outline-none focus:border-blue-500"
                />
                <button onClick={saveTemplate} className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12.5px] font-medium cursor-pointer">
                  Save template
                </button>
              </FloatingPopover>
              <button
                disabled={!dirty || saving}
                onClick={() => apply(false)}
                className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium cursor-pointer disabled:bg-neutral-700 disabled:text-neutral-400 disabled:cursor-default"
              >
                {saving ? 'Applying…' : 'Apply changes'}
              </button>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// The rules a status set must meet before it is saved — a Space's, a List's or a template's.
function validateRows(rows: Draft[]): string | null {
  const names = rows.map((d) => d.name.trim());
  if (names.some((n) => !n)) return 'Every status needs a name.';
  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) return 'Two statuses have the same name.';
  if (!rows.some((d) => d.kind === 'open')) return 'Keep at least one Active status — new tasks start there.';
  return null;
}

// The Active / Done / Closed sections with their rows — the editing half of the window, shared by a
// Space's or List's statuses and by editing a status template.
function StatusSections({
  draft,
  setDraft,
  focusKey,
  setFocusKey,
}: {
  draft: Draft[];
  setDraft: React.Dispatch<React.SetStateAction<Draft[]>>;
  focusKey: string | null;
  setFocusKey: (key: string | null) => void;
}) {
  const patch = (key: string, p: Partial<Draft>) => setDraft((d) => d.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const remove = (key: string) => setDraft((d) => d.filter((x) => x.key !== key));
  const add = (kind: StatusKindName) => {
    const key = newKey();
    const used = new Set(draft.map((d) => d.color));
    setDraft((d) => [...d, { key, name: '', color: COLORS.find((c) => !used.has(c)) ?? COLORS[0], kind, icon: null }]);
    setFocusKey(key);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.findIndex((x) => x.key === active.id);
      const to = d.findIndex((x) => x.key === over.id);
      if (from < 0 || to < 0 || d[from].kind !== d[to].kind) return d;
      return arrayMove(d, from, to);
    });
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      {KINDS.map(({ kind, label, info }) => {
        const rows = draft.filter((d) => d.kind === kind);
        return (
          <div key={kind}>
            <div className="flex items-center justify-between mb-2">
              <p className="flex items-center gap-1.5 text-[12px] text-neutral-400">
                {label}
                <span title={info} className="text-neutral-600 cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </p>
              <button onClick={() => add(kind)} title={`Add a ${label} status`} className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800 cursor-pointer">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {rows.map((d) => (
                  <DraftRow
                    key={d.key}
                    d={d}
                    autoFocus={focusKey === d.key}
                    onFocused={() => setFocusKey(null)}
                    onChange={(p) => patch(d.key, p)}
                    onRemove={() => remove(d.key)}
                  />
                ))}
                <button
                  onClick={() => add(kind)}
                  className="w-full h-9 rounded-lg border border-dashed border-neutral-700 hover:border-neutral-500 flex items-center justify-center gap-2 text-[12.5px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add status
                </button>
              </div>
            </SortableContext>
          </div>
        );
      })}
    </DndContext>
  );
}

function TemplateGroup({
  label,
  templates,
  selected,
  onPick,
  onDelete,
  onEdit,
}: {
  label: string;
  templates: StatusTemplateDef[];
  selected?: string;
  onPick: (t: StatusTemplateDef) => void;
  onDelete?: (t: StatusTemplateDef) => void;
  onEdit?: (t: StatusTemplateDef) => void;
}) {
  return (
    <div className="mb-1">
      <p className="px-2 pt-1 pb-1 text-[10px] font-semibold text-neutral-500">{label}</p>
      {templates.map((t) => (
        <div key={t.id} className="group/tpl flex items-center rounded-lg hover:bg-neutral-800">
          <button onClick={() => onPick(t)} className="flex-1 min-w-0 px-2 py-1.5 text-left cursor-pointer">
            <span className="flex items-center gap-2 text-[12.5px] text-neutral-200">
              <span className="truncate">{t.name}</span>
              {selected === t.id && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
            </span>
            <span className="flex items-center gap-1 mt-1">
              {t.statuses.map((s, i) => (
                <StatusGlyph key={i} kind={s.kind} color={s.color} icon={s.icon} size={10} />
              ))}
            </span>
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(t)}
              title="Edit template"
              className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-app-strong md:opacity-0 md:group-hover/tpl:opacity-100 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(t)}
              title="Delete template"
              className="w-7 h-7 mr-1 rounded-md flex items-center justify-center text-neutral-500 hover:text-red-400 md:opacity-0 md:group-hover/tpl:opacity-100 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function DraftRow({
  d,
  autoFocus,
  onFocused,
  onChange,
  onRemove,
}: {
  d: Draft;
  autoFocus: boolean;
  onFocused: () => void;
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.key });
  const [lookOpen, setLookOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    onFocused();
  }, [autoFocus, onFocused]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group/row flex items-center gap-2 h-9 pl-1.5 pr-1 rounded-lg border border-neutral-700/80 bg-neutral-900 hover:border-neutral-600"
    >
      <span {...attributes} {...listeners} className="text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <FloatingPopover
        open={lookOpen}
        onClose={() => setLookOpen(false)}
        panelClassName="w-60 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2.5 space-y-2.5"
        anchor={
          <button onClick={() => setLookOpen((o) => !o)} title="Colour and icon" className="flex rounded-full cursor-pointer hover:scale-110 transition-transform">
            <StatusGlyph kind={d.kind} color={d.color} icon={d.icon} size={16} />
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className={`w-6 h-6 rounded-full cursor-pointer ${d.color === c ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ring-app-strong' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {[null, ...Object.keys(STATUS_ICONS)].map((k) => (
            <button
              key={k ?? 'default'}
              onClick={() => onChange({ icon: k })}
              title={k ?? 'Default'}
              className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${d.icon === k ? 'bg-neutral-700 ring-1 ring-blue-500' : 'hover:bg-neutral-800'}`}
            >
              <StatusGlyph kind={d.kind} color={d.color} icon={k} size={16} />
            </button>
          ))}
        </div>
      </FloatingPopover>
      <input
        ref={input}
        value={d.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onBlur={() => {
          // An empty new row was a "+" pressed and abandoned; an emptied existing one keeps its name.
          if (!d.name.trim()) {
            if (!d.id && !d.origName) onRemove();
            else onChange({ name: d.origName ?? '' });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="STATUS NAME"
        className="flex-1 min-w-0 bg-transparent text-[12.5px] font-bold uppercase tracking-wide text-app-strong placeholder:text-neutral-600 focus:outline-none"
      />
      <FloatingPopover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="right"
        panelClassName="w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
        anchor={
          <button onClick={() => setMenuOpen((o) => !o)} className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-app-strong hover:bg-neutral-800 cursor-pointer">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        }
      >
        <RowMenuItem
          onClick={() => {
            setMenuOpen(false);
            requestAnimationFrame(() => input.current?.select());
          }}
          icon={<Pencil className="w-3.5 h-3.5" />}
        >
          Rename
        </RowMenuItem>
        <RowMenuItem
          onClick={() => {
            setMenuOpen(false);
            setLookOpen(true);
          }}
          icon={<StatusGlyph kind={d.kind} color={d.color} icon={d.icon} size={13} />}
        >
          Colour and icon
        </RowMenuItem>
        <div className="border-t border-neutral-800 my-1" />
        {KINDS.filter((k) => k.kind !== d.kind).map((k) => (
          <RowMenuItem
            key={k.kind}
            onClick={() => {
              setMenuOpen(false);
              onChange({ kind: k.kind });
            }}
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Move to {k.label}
          </RowMenuItem>
        ))}
        <div className="border-t border-neutral-800 my-1" />
        <RowMenuItem
          onClick={() => {
            setMenuOpen(false);
            onRemove();
          }}
          icon={<Trash2 className="w-3.5 h-3.5" />}
          danger
        >
          Delete status
        </RowMenuItem>
      </FloatingPopover>
    </div>
  );
}

function RowMenuItem({ icon, onClick, children, danger }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-[12.5px] hover:bg-neutral-800 cursor-pointer ${danger ? 'text-red-400' : 'text-neutral-200'}`}
    >
      <span className={`shrink-0 flex ${danger ? '' : 'text-neutral-400'}`}>{icon}</span>
      {children}
    </button>
  );
}
