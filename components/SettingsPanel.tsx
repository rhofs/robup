'use client';

import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { X, Settings, Check, Trash2, Plus, Link2, Upload, Share2, Download, Monitor, Sun, Moon, Smartphone, ArrowLeft, ChevronRight, Pencil, Shield, UserPlus, UserCircle, Building2, Users } from 'lucide-react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';
import {
  readHapticStrength,
  setHapticStrength,
  readNativeHapticCapabilities,
  describeNativeHapticPath,
  type HapticStrength,
  type NativeHapticCapabilities,
} from '../lib/haptics';
import { useTaskStore, type HierarchyWorkspace, type AppUser } from '../store/useTaskStore';
import { useChatStore } from '../store/useChatStore';
import { getPushStatus, enablePush, disablePush } from '../lib/pushClient';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useIsMobile } from '../hooks/useIsMobile';
import { Capacitor } from '@capacitor/core';
import ColorSwatchPicker from './ColorSwatchPicker';
import { copyToClipboard } from '../lib/copyToClipboard';

// Moved here from the now-deleted AccountSettingsPanel.tsx along with the rest of the Account
// tab's content (see the tab === 'account' branch below).
function InstallRow() {
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt();
  if (isStandalone) return null;
  if (canInstall) {
    return (
      <button
        onClick={promptInstall}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
      >
        <Download className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="text-xs text-neutral-300">Install Siqt as an app</span>
      </button>
    );
  }
  if (isIOS) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 text-left">
        <Download className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <span className="text-xs text-neutral-500">On iPhone/iPad: tap Share, then &quot;Add to Home Screen&quot;</span>
      </div>
    );
  }
  return null;
}

// The Android app, offered as a plain download because it is not on Play Store yet. Without this
// the only way for a colleague to get it was for someone to send them the file by hand.
//
// Deliberately a real <a href> to a static file rather than anything cleverer: the point is that it
// behaves like any other download, including on the corporate-managed and Chinese-region phones
// this is actually going to be installed on.
function AndroidAppRow() {
  // Resolved in an effect, not during render: this component is server-rendered too, and both
  // checks below read browser-only state. Deciding during render would either throw or produce
  // markup the client immediately contradicts.
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already inside the app — offering it its own installer is noise.
    if (Capacitor.isNativePlatform()) return;
    // An APK cannot be installed on iOS at any price, so the row would be a dead end rather than
    // an option. iPhone users are covered by InstallRow's "Add to Home Screen" note above.
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <a
      href="/siqt.apk"
      download
      className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
    >
      <Smartphone className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
      <span className="text-xs text-neutral-300">
        Download the Android app
        {/* Said up front rather than left as a surprise: the warning Android shows for any app not
            installed from a store is alarming, and someone who has not been told to expect it
            reasonably reads it as "this file is unsafe" and stops. Naming it here turns it into a
            step instead of a reason to give up. */}
        <span className="block text-neutral-500 mt-0.5">
          Not from Play Store, so Android will ask you to allow installing from this source
        </span>
      </span>
    </a>
  );
}

// What the phone's motor can actually do, shown only inside the app.
//
// This exists because every fallback in SiqtHapticsPlugin is silent by design: a device without
// composition primitives quietly plays a predefined effect instead, which feels exactly like the
// change never having shipped. Tuning the haptics has taken several rounds of "does this feel
// different?" over chat, and twice the honest answer could not be distinguished from a bug. One
// readable line ends that — it says which of the three paths the device is actually taking.
function HapticDiagnostics({ strength }: { strength: HapticStrength }) {
  const [caps, setCaps] = useState<NativeHapticCapabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readNativeHapticCapabilities().then((value) => {
      if (!cancelled) setCaps(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Null outside the app, and on an APK older than the plugin method — in both cases there is
  // nothing useful to say, so the line simply is not there.
  if (!caps) return null;

  // The switched-off case comes FIRST, and that ordering is the whole lesson of this component.
  // Its earlier version reported the device's capabilities regardless of whether haptics were
  // enabled, so with the setting on Off it cheerfully said "composed pulse" — describing a path
  // nothing was taking. A whole debugging round went into a phone that had simply been switched
  // off, while the diagnostics line sat there implying everything was fine. A diagnostic that
  // ignores the most common cause is worse than none.
  if (strength === 'off') {
    return (
      <div className="text-[10px] text-neutral-500 px-1 pb-3 leading-relaxed">
        Native haptics: <span className="text-amber-500/80">off</span> — nothing will play until this
        is set to Light or Strong.
      </div>
    );
  }

  // Derived in lib/haptics.ts, deliberately — see describeNativeHapticPath. Duplicating the
  // decision here is what made this line report the wrong path twice.
  const path = describeNativeHapticPath(caps);

  return (
    <div className="text-[10px] text-neutral-500 px-1 pb-3 leading-relaxed">
      Native haptics: <span className="text-neutral-400">{path}</span>
      {' · '}
      primitives {caps.supportsPrimitives ? 'yes' : 'no'}
      {' · '}
      amplitude {caps.hasAmplitudeControl ? 'yes' : 'no'}
      {' · '}
      Android API {caps.apiLevel}
    </div>
  );
}

// Why push is unavailable, and what to do about it — which differs enough per platform that one
// sentence cannot serve all of them.
function PushUnsupportedNote() {
  const { isIOS, isStandalone } = useInstallPrompt();

  if (isIOS && !isStandalone) {
    return (
      <p className="text-xs text-neutral-500 leading-relaxed">
        On iPhone, notifications work once Siqt is on your Home Screen. Tap Share in Safari, choose
        &quot;Add to Home Screen&quot;, then open Siqt from that icon and come back here. Needs iOS
        16.4 or newer.
      </p>
    );
  }

  if (isIOS) {
    // Already on the Home Screen and still unsupported: the iOS version predates web push, and no
    // instruction can work around that — so say so plainly instead of sending them in a circle.
    return (
      <p className="text-xs text-neutral-500 leading-relaxed">
        This iPhone is on an iOS older than 16.4, the first version that can receive web
        notifications.
      </p>
    );
  }

  return <p className="text-xs text-neutral-500">Push notifications aren't supported in this browser.</p>;
}

const HIDDEN_NAV_TABS_STORAGE_KEY = 'siqt.hiddenNavTabs';

export type NavTabId = 'board' | 'calendar' | 'docs' | 'office' | 'chat';

// Kept, unreferenced by this panel's own UI, because readHiddenNavTabs/setNavTabHidden below are
// still the storage contract the classic layout reads. The "Visible tabs" control that used them was
// removed with the five-tab nav it belonged to — see this session's PLANNING entry, including what
// happens to anyone who had hidden a tab before it went.
const NAV_TABS: { id: NavTabId; label: string }[] = [
  { id: 'board', label: 'Spaces' },
  { id: 'calendar', label: 'Planner' },
  { id: 'docs', label: 'Docs' },
  { id: 'office', label: 'Office' },
  { id: 'chat', label: 'Chat' },
];

// Same "only persist the non-default (hidden) minority" Set-of-ids shape as FolderTree.tsx's
// readCollapsedFolders/setFolderCollapsed — every tab defaults to visible, so an empty/missing
// key means "show everything," not "hide everything."
export function readHiddenNavTabs(): Set<NavTabId> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_NAV_TABS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function setNavTabHidden(tabId: NavTabId, hidden: boolean) {
  try {
    const next = readHiddenNavTabs();
    if (hidden) next.add(tabId);
    else next.delete(tabId);
    localStorage.setItem(HIDDEN_NAV_TABS_STORAGE_KEY, JSON.stringify([...next]));
  } catch {}
}

const HIDE_WEEK_NUMBERS_STORAGE_KEY = 'siqt.hideWeekNumbers';

// Same "only persist the non-default minority" idea as the nav-tab toggles above — week numbers
// are visible unless someone's explicitly turned them off, so a missing key means "show them."
export function readHideWeekNumbers(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(HIDE_WEEK_NUMBERS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideWeekNumbers(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDE_WEEK_NUMBERS_STORAGE_KEY, '1');
    else localStorage.removeItem(HIDE_WEEK_NUMBERS_STORAGE_KEY);
  } catch {}
}

const ROLE_COLOR_CHOICES = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#94A3B8'];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const HAPTIC_OPTIONS: { value: HapticStrength; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'strong', label: 'Strong' },
];

type InviteRow = { id: string; role: 'admin' | 'member'; createdAt: string; createdBy: { name: string } };
type ClickUpRow = Record<string, string>;

type ImportPreview = {
  taskCount: number;
  spaceNames: Set<string>;
  listNames: Set<string>;
  folderPaths: Set<string>;
  statusNames: Set<string>;
  matchedAssignees: Set<string>;
  unmatchedAssignees: Set<string>;
  skippedCount: number;
};

type ImportResult = {
  tasksCreated: number;
  spacesCreated: number;
  foldersCreated: number;
  listsCreated: number;
  statusesCreated: number;
  unmatchedAssignees: string[];
  skippedRows: { taskName: string; reason: string }[];
};

// Aggregate-only preview (counts, not a per-row table — real exports run into the thousands of
// rows) computed purely client-side from the parsed CSV, before anything is sent to the server —
// lets a bad file be inspected and abandoned with zero side effects.
function buildImportPreview(rows: ClickUpRow[], memberNames: Set<string>): ImportPreview {
  const preview: ImportPreview = {
    taskCount: 0,
    spaceNames: new Set(),
    listNames: new Set(),
    folderPaths: new Set(),
    statusNames: new Set(),
    matchedAssignees: new Set(),
    unmatchedAssignees: new Set(),
    skippedCount: 0,
  };
  for (const row of rows) {
    const title = row['Task Name']?.trim();
    if (!title || !row['Space Name']?.trim() || !row['List Name']?.trim()) {
      preview.skippedCount++;
      continue;
    }
    preview.taskCount++;
    preview.spaceNames.add(row['Space Name'].trim());
    preview.listNames.add(row['List Name'].trim());
    if (row['Status']?.trim()) preview.statusNames.add(row['Status'].trim());
    try {
      const segments = JSON.parse(row['Folder Name/Path'] || '[]');
      if (Array.isArray(segments) && segments.length) preview.folderPaths.add(segments.join(' / '));
    } catch {}
    const inner = (row['Assignees'] || '').trim().replace(/^\[/, '').replace(/\]$/, '').trim();
    if (inner) {
      inner.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => {
        (memberNames.has(n) ? preview.matchedAssignees : preview.unmatchedAssignees).add(n);
      });
    }
  }
  return preview;
}

// Structurally identical to TrashPanel.tsx (self-contained, onClose prop, centered overlay) —
// deliberately no framer-motion, instant mount/unmount, matching the "cheaper feel" direction of
// this session's other changes. Absorbed Roles/Invite/Import from the old TeamPanel.tsx (now
// deleted) — those are workspace governance actions, not personal UI prefs like the tab-visibility
// toggles below, so they're Owner/Admin-gated (`canManage`) while General stays open to everyone.
export default function SettingsPanel({
  workspace,
  canManage,
  user,
  onCopyCalendarLink,
  onEditProfile,
  registerBack,
  onClose,
  onChange,
  initialTab = 'general',
}: {
  workspace: HierarchyWorkspace;
  canManage: boolean;
  // Account tab's own data — personal, not workspace-scoped (see that tab's own comment below).
  user: AppUser | null;
  onCopyCalendarLink: () => void;
  // Opens the full profile screen. Optional so a caller that has nowhere to send someone simply does
  // not render the button, rather than rendering one that goes nowhere.
  onEditProfile?: () => void;
  // Lets the page's hardware-Back handler step back through this panel before it starts unwinding
  // the app behind it. The callback returns true when it consumed the press (there was a sub-screen
  // to leave), false when the panel is already at its top level and Back should close it.
  //
  // A callback rather than this panel registering with lib/nativeBack itself: that handler is a
  // single global slot the page re-registers on almost every state change, so a second writer would
  // win or lose depending on render order — which is a coin toss, not a design.
  registerBack?: (fn: (() => boolean) | null) => void;
  onClose: () => void;
  onChange: () => void;
  // Lets a caller land directly on a specific tab — e.g. Office's own "Invite" entry point opens
  // straight to 'invite' instead of making someone click through from 'general' every time.
  initialTab?: 'general' | 'roles' | 'invite' | 'import' | 'account';
}) {
  const {
    createRole,
    updateRole,
    deleteRole,
    assignRole,
    unassignRole,
    updateWorkspaceDetails,
    sendWorkspaceMemberInvite,
    changeWorkspaceMemberRole,
    removeWorkspaceMember,
    sendWorkspaceMemberInviteByEmail,
  } = useTaskStore();
  const { connections, fetchConnections } = useChatStore();
  // initialTab is kept as the caller-facing shape so no call site had to change when this panel was
  // split in two — the old tab names still say enough to land in the right place.
  const [section, setSection] = useState<'you' | 'workspace'>(initialTab === 'account' ? 'you' : 'workspace');
  const [sub, setSub] = useState<null | 'roles' | 'invite' | 'import' | 'profile' | 'members'>(
    initialTab === 'roles' || initialTab === 'invite' || initialTab === 'import' ? initialTab : null
  );
  const [weekNumbersHidden, setWeekNumbersHidden] = useState(() => readHideWeekNumbers());
  // Lazy initializer, not a useState(default) + useEffect correction — this panel is mounted
  // fresh each time it opens, and a one-tick-late correction would visibly flip the selected
  // segment (same class of bug as useIsMobile's own documented flash-of-wrong-value).
  const [themePref, setThemePref] = useState<ThemePreference>(() => readThemePreference());
  const [haptics, setHaptics] = useState<HapticStrength>(() => readHapticStrength());
  const isMobile = useIsMobile();

  // --- Workspace identity (backlog #2) --- org type + work email, set at creation, editable
  // here by Owner/Admin only (server-enforced too, see PATCH /api/workspaces/[id]/route.ts).
  const [emailDraft, setEmailDraft] = useState(workspace.workEmail ?? '');
  const [logoDraft, setLogoDraft] = useState(workspace.avatarUrl ?? '');
  // Which member the remove confirmation is open for — an id rather than a boolean, so the
  // confirmation can name the person it is about.
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);

  // --- Push notifications --- per-browser, not per-account (a phone and a laptop are two
  // separate subscriptions) — see lib/pushClient.ts.
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'subscribed' | 'not-subscribed' | 'loading'>('loading');
  const [pushTest, setPushTest] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  const toggleWeekNumbers = () => {
    const next = !weekNumbersHidden;
    setHideWeekNumbers(next);
    setWeekNumbersHidden(next);
    onChange();
  };

  // --- Roles ---
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLOR_CHOICES[0]);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  // --- Invite --- (local, Owner/Admin-only UI state, not part of the global store shape — a
  // workspace's invite-link list doesn't need to live in the hierarchy every member fetches)
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [newInviteRole, setNewInviteRole] = useState<'admin' | 'member'>('member');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- Direct invite via Network (backlog #8) --- targeted, in-app invites to a specific
  // Connection/coworker, distinct from the reusable link above. Same local-state-not-store shape
  // as `invites`.
  const [directQuery, setDirectQuery] = useState('');
  const [directPending, setDirectPending] = useState<
    { id: string; role: 'admin' | 'member'; toUser: { id: string; name: string }; invitedBy: { name: string } }[] | null
  >(null);
  const [directInviteError, setDirectInviteError] = useState<string | null>(null);
  const [directInviteBusyId, setDirectInviteBusyId] = useState<string | null>(null);
  // Invite-by-email form — shares directInviteError with the Network picker below, since only one
  // of the two is ever being used at a time and both report into the same spot.
  const [inviteEmail, setInviteEmail] = useState('');
  const [emailInviteBusy, setEmailInviteBusy] = useState(false);

  const refetchDirectPending = () => {
    fetch(`/api/workspaces/${workspace.id}/member-invites`)
      .then((r) => r.json())
      .then(setDirectPending)
      .catch(() => setDirectPending([]));
  };

  useEffect(() => {
    if (!registerBack) return;
    registerBack(() => {
      if (sub) {
        setSub(null);
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [registerBack, sub]);

  useEffect(() => {
    if (sub !== 'invite' || !canManage) return;
    fetch(`/api/workspaces/${workspace.id}/invites`)
      .then((r) => r.json())
      .then(setInvites)
      .catch(() => setInvites([]));
    refetchDirectPending();
    fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, canManage, workspace.id]);

  const createInvite = async () => {
    const res = await fetch(`/api/workspaces/${workspace.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newInviteRole }),
    });
    const created = await res.json();
    setInvites((prev) => [created, ...(prev ?? [])]);
  };

  const revokeInvite = async (inviteId: string) => {
    setInvites((prev) => (prev ?? []).filter((i) => i.id !== inviteId));
    await fetch(`/api/workspaces/${workspace.id}/invites/${inviteId}`, { method: 'DELETE' });
  };

  const copyInviteLink = async (inviteId: string) => {
    const ok = await copyToClipboard(`${window.location.origin}/invite/${inviteId}`);
    if (!ok) return;
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId((id) => (id === inviteId ? null : id)), 1500);
  };

  // --- Import ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<ClickUpRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const memberNames = new Set(workspace.members.map((m) => m.name));

  const handleCsvFile = async (file: File) => {
    setImportResult(null);
    setImportError(null);
    setCsvFileName(file.name);
    const text = await file.text();
    const parsed = Papa.parse<ClickUpRow>(text, { header: true, skipEmptyLines: true });
    setCsvRows(parsed.data);
    setImportPreview(buildImportPreview(parsed.data, memberNames));
  };

  const confirmImport = async () => {
    if (!csvRows) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/import/clickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: csvRows }),
      });
      if (!res.ok) throw new Error('Import failed');
      const result: ImportResult = await res.json();
      setImportResult(result);
      setCsvRows(null);
      setImportPreview(null);
      await Promise.all([useTaskStore.getState().refetchWorkspaces(), useTaskStore.getState().refetchTasks()]);
    } catch {
      setImportError('Something went wrong during import. No partial changes were rolled back — check the workspace before retrying.');
    } finally {
      setImportBusy(false);
    }
  };

  // Two halves, mirroring the app itself: you on the left, the workspace on the right — the same
  // order as Home and Office in the nav, which is what the user asked for and the reason it reads
  // as one idea rather than two screens that happen to share a panel.
  //
  // The old five-tab bar (General / Roles / Invite / Import / Account) was from the layout this app
  // no longer has, and it mixed the two halves: "General" held the workspace's name AND your theme
  // AND your haptics. The split is the whole point — everything that only affects you on one side,
  // everything that affects the people you work with on the other.
  //
  // Roles, Invite and Import are sub-screens rather than siblings: each is a task you go and do and
  // come back from, not a place you switch between.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-3" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-4 pt-4 pb-3 flex items-center gap-2">
          {sub && (
            <button
              onClick={() => setSub(null)}
              title="Back"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h3 className="font-bold text-sm text-app-strong flex-1 min-w-0 truncate">
            {/* Named with the workspace, not generically. "Invite people" does not say who they are
                being invited to, and this panel is reachable from two contexts — the one thing a
                title here can usefully add is which door it is opening. */}
            {sub === 'roles'
              ? `Roles in ${workspace.name}`
              : sub === 'invite'
                ? `Invite to ${workspace.name}`
                : sub === 'import'
                  ? `Import into ${workspace.name}`
                  : sub === 'profile'
                    ? 'Work profile'
                    : sub === 'members'
                      ? `People in ${workspace.name}`
                      : 'Settings'}
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The same two-option pill Home and Office use. Learning the control once should be
            enough — it is the app's one way of saying "the same shape, seen two ways". */}
        {!sub && (
          <div className="mx-4 mb-3 flex gap-0.5 rounded-full bg-neutral-800/60 p-0.5 shrink-0">
            {([
              ['you', 'You'],
              ['workspace', 'Workspace'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold transition cursor-pointer ${
                  section === id ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {sub === 'members' ? (
          <div className="px-4 pb-4 space-y-0.5 h-[26rem] overflow-y-auto">
            {workspace.members.map((m) => {
              const isOwner = m.workspaceRole === 'owner';
              return (
                <div key={m.id} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.initials}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-neutral-200 truncate">
                      {m.name}
                      {m.id === user?.id && <span className="text-neutral-500"> (you)</span>}
                    </span>
                    <span className="block text-[11px] text-neutral-500 capitalize">{m.workspaceRole}</span>
                  </span>
                  {/* The owner is deliberately not editable here, and the server refuses it too —
                      this only hides a control that would always fail. Everything else is admin-only,
                      so a plain member sees a list and nothing they can break. */}
                  {canManage && !isOwner && m.id !== user?.id && (
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          changeWorkspaceMemberRole(
                            workspace.id,
                            m.id,
                            m.workspaceRole === 'admin' ? 'member' : 'admin'
                          )
                        }
                        title={m.workspaceRole === 'admin' ? 'Make a member' : 'Make an admin'}
                        className="text-[10px] px-2 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800/60 cursor-pointer transition"
                      >
                        {m.workspaceRole === 'admin' ? 'Make member' : 'Make admin'}
                      </button>
                      <button
                        onClick={() => setRemoveTarget(m.id)}
                        title="Remove from workspace"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-800/60 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {/* Removing someone takes their access to everything in here, so it asks first — the
                one destructive action on this screen, sitting beside a role toggle that is not. */}
            {removeTarget && (
              <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3 space-y-2">
                <p className="text-[11px] text-neutral-300">
                  Remove {workspace.members.find((m) => m.id === removeTarget)?.name} from{' '}
                  {workspace.name}? They lose access to everything in it.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      removeWorkspaceMember(workspace.id, removeTarget);
                      setRemoveTarget(null);
                    }}
                    className="flex-1 text-[11px] py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium cursor-pointer"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => setRemoveTarget(null)}
                    className="flex-1 text-[11px] py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800/60 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : sub === 'profile' ? (
          // Everything that IS the workspace — its mark, its name, its type, its work email. Moved
          // off the Workspace list and behind "Edit work profile", so that list opens on who this
          // workspace is rather than on a form.
          <div className="px-4 pb-4 space-y-1 h-[26rem] overflow-y-auto">
            {!workspace.isPersonal && (
              <>
                {/* The mark, first — it is how everyone else recognises this workspace in their own
                    header now that it sits where a profile picture would. A workspace with no colour
                    falls back to the app accent, which means every such workspace looks identical;
                    that was tolerable while the mark was a small square next to the name and is not
                    once it is the thing you navigate by. */}
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Mark</div>
                <div className="flex items-center gap-3 px-1 pb-3">
                  {workspace.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={workspace.avatarUrl} alt={workspace.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center text-lg font-bold text-white"
                      style={{ backgroundColor: workspace.color ?? '#2563eb' }}
                    >
                      {workspace.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {canManage ? (
                      <>
                        <ColorSwatchPicker
                          value={workspace.color}
                          onChange={(color) => updateWorkspaceDetails(workspace.id, { color })}
                          choices={ROLE_COLOR_CHOICES}
                          size="sm"
                        />
                        {/* A URL rather than a file picker, because that is how this app already does
                            avatars (ProfilePage's own AvatarEditor). One way of doing a thing, even
                            when it is not the fanciest way — two upload flows for the same kind of
                            image would be worse than this being plain. */}
                        <input
                          value={logoDraft}
                          onChange={(e) => setLogoDraft(e.target.value)}
                          onBlur={() => updateWorkspaceDetails(workspace.id, { avatarUrl: logoDraft.trim() || null })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setLogoDraft(workspace.avatarUrl ?? '');
                          }}
                          placeholder="Logo image URL (optional)"
                          className="mt-2 w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-app-strong placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
                        />
                      </>
                    ) : (
                      <p className="text-[11px] text-neutral-500">Only admins can change this.</p>
                    )}
                  </div>
                </div>

                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Workspace</div>
                <div className="px-1 pb-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 w-16 shrink-0">Type</span>
                    {canManage ? (
                      <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5 flex-1">
                        <button
                          onClick={() => updateWorkspaceDetails(workspace.id, { orgType: 'company' })}
                          className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                            workspace.orgType === 'company' ? 'bg-neutral-800 text-app-strong' : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Company
                        </button>
                        <button
                          onClick={() => updateWorkspaceDetails(workspace.id, { orgType: 'personal_project' })}
                          className={`flex-1 text-[10px] py-1 rounded cursor-pointer transition ${
                            workspace.orgType === 'personal_project' ? 'bg-neutral-800 text-app-strong' : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          Personal project
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-300">
                        {workspace.orgType === 'company' ? 'Company' : workspace.orgType === 'personal_project' ? 'Personal project' : 'Not set'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 w-16 shrink-0">Work email</span>
                    {canManage && editingEmail ? (
                      <input
                        autoFocus
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onBlur={() => {
                          setEditingEmail(false);
                          updateWorkspaceDetails(workspace.id, { workEmail: emailDraft.trim() || null });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') {
                            setEmailDraft(workspace.workEmail ?? '');
                            setEditingEmail(false);
                          }
                        }}
                        className="flex-1 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-app-strong focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => canManage && setEditingEmail(true)}
                        disabled={!canManage}
                        className={`flex-1 text-left text-xs px-1 ${canManage ? 'text-neutral-300 hover:text-app-strong cursor-pointer' : 'text-neutral-500 cursor-default'}`}
                      >
                        {workspace.workEmail || (canManage ? 'Not set — click to add' : 'Not set')}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : sub === 'roles' ? (
          <div className="p-5 space-y-2 h-96 overflow-y-auto">
            {workspace.roles.length === 0 && !creatingRole && <p className="text-xs text-neutral-500">No roles yet — roles let you grant specific people access to private Spaces, Folders, Lists, and Tasks.</p>}
            {workspace.roles.map((r) => {
              const expanded = expandedRoleId === r.id;
              return (
                <div key={r.id} className="bg-neutral-950/60 border border-neutral-800 rounded overflow-hidden">
                  <button
                    onClick={() => setExpandedRoleId(expanded ? null : r.id)}
                    className="w-full flex items-center justify-between px-3 py-2 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-xs text-neutral-200 font-medium truncate">{r.name}</span>
                      <span className="text-[10px] text-neutral-600 font-mono">{r.memberIds.length}</span>
                    </div>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRole(workspace.id, r.id);
                      }}
                      className="text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-neutral-800 px-3 py-2 space-y-1.5">
                      <div className="pb-1.5">
                        <ColorSwatchPicker value={r.color} onChange={(color) => updateRole(workspace.id, r.id, { color })} choices={ROLE_COLOR_CHOICES} size="sm" />
                      </div>
                      {workspace.members.map((m) => {
                        const has = r.memberIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() => (has ? unassignRole(workspace.id, r.id, m.id) : assignRole(workspace.id, r.id, m.id))}
                            className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-800/60 cursor-pointer text-left"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${has ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'}`}
                            >
                              {has && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <span className="text-xs text-neutral-300 truncate">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {creatingRole ? (
              <div className="space-y-2 pt-1">
                <input
                  autoFocus
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newRoleName.trim()) {
                      createRole(workspace.id, newRoleName.trim(), newRoleColor);
                      setNewRoleName('');
                      setCreatingRole(false);
                    }
                    if (e.key === 'Escape') setCreatingRole(false);
                  }}
                  placeholder="Role name..."
                  className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none"
                />
                <ColorSwatchPicker value={newRoleColor} onChange={setNewRoleColor} choices={ROLE_COLOR_CHOICES} size="sm" />
                <button
                  onClick={() => {
                    if (!newRoleName.trim()) return;
                    createRole(workspace.id, newRoleName.trim(), newRoleColor);
                    setNewRoleName('');
                    setCreatingRole(false);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded font-medium cursor-pointer"
                >
                  Create role
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingRole(true)}
                className="w-full flex items-center gap-1.5 justify-center text-xs text-blue-400 hover:bg-neutral-800/60 rounded py-2 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New role
              </button>
            )}
          </div>
        ) : sub === 'invite' ? (
          <div className="p-5 space-y-2 h-96 overflow-y-auto">
            {/* Invite by email — for someone whose address you know but who isn't in your
                Network, which the picker below can't reach. No email is sent (this app has no
                mail infrastructure): an existing account gets the invite in-app, and if no
                account uses that address the error says so and points at the shareable link
                further down. Added per direct feedback: "bør også kunne skrive inn eposten." */}
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Invite by email</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const email = inviteEmail.trim();
                if (!email) return;
                setDirectInviteError(null);
                setEmailInviteBusy(true);
                const result = await sendWorkspaceMemberInviteByEmail(workspace.id, email, newInviteRole);
                setEmailInviteBusy(false);
                if (result.ok) {
                  setInviteEmail('');
                  refetchDirectPending();
                } else {
                  setDirectInviteError(result.error ?? 'Could not send invite');
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!inviteEmail.trim() || emailInviteBusy}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] px-3 py-1.5 rounded font-medium cursor-pointer shrink-0"
              >
                {emailInviteBusy ? 'Sending…' : 'Invite'}
              </button>
            </form>

            <div className="h-px bg-neutral-800/70 my-2" />

            {/* Discord-style targeted invite via Network (backlog #8) — pick someone from your
                Connections/coworkers directly, rather than only ever sharing a link. */}
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Invite from your Network</p>
            <input
              value={directQuery}
              onChange={(e) => setDirectQuery(e.target.value)}
              placeholder="Search your Network..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none focus:border-blue-500"
            />
            {directInviteError && <p className="text-[11px] text-red-400">{directInviteError}</p>}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {connections
                .filter((c) => {
                  const isMember = workspace.members.some((m) => m.id === c.id);
                  const alreadyInvited = directPending?.some((i) => i.toUser.id === c.id);
                  const matchesQuery = !directQuery.trim() || c.name.toLowerCase().includes(directQuery.trim().toLowerCase());
                  return !isMember && !alreadyInvited && matchesQuery;
                })
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-neutral-800/40">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0" style={{ backgroundColor: c.color }}>
                        {c.initials}
                      </span>
                      <span className="text-xs text-neutral-300 truncate">{c.name}</span>
                    </div>
                    <button
                      disabled={directInviteBusyId === c.id}
                      onClick={async () => {
                        setDirectInviteError(null);
                        setDirectInviteBusyId(c.id);
                        const result = await sendWorkspaceMemberInvite(workspace.id, c.id, newInviteRole);
                        setDirectInviteBusyId(null);
                        if (!result.ok) setDirectInviteError(result.error || 'Could not send invite');
                        else refetchDirectPending();
                      }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-40 cursor-pointer shrink-0 px-2 py-0.5"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              {connections.length === 0 && <p className="text-[11px] text-neutral-500 px-2">No one in your Network yet — connect with people first.</p>}
            </div>

            {directPending && directPending.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-[10px] text-neutral-500">Pending:</p>
                {directPending.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800 rounded px-2.5 py-1.5">
                    <span className="text-xs text-neutral-300">{inv.toUser.name}</span>
                    <button
                      onClick={async () => {
                        await fetch(`/api/workspace-member-invites/${inv.id}`, { method: 'DELETE' });
                        refetchDirectPending();
                      }}
                      title="Cancel invite"
                      className="text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-neutral-800" />
              <span className="text-[9px] text-neutral-600 uppercase tracking-wide">or share a link</span>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>

            <p className="text-[11px] text-neutral-500">Anyone with this link can join {workspace.name} — share it however you'd like (Slack, email, text). Links don't expire; revoke one to stop it from working.</p>

            <div className="flex items-center gap-2 pt-1">
              <select
                value={newInviteRole}
                onChange={(e) => setNewInviteRole(e.target.value as 'admin' | 'member')}
                className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-xs text-app-strong focus:outline-none"
              >
                <option value="member">Joins as Member</option>
                <option value="admin">Joins as Admin</option>
              </select>
              <button
                onClick={createInvite}
                className="flex-1 flex items-center gap-1.5 justify-center bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Create invite link
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {invites === null ? (
                <p className="text-xs text-neutral-500">Loading…</p>
              ) : invites.length === 0 ? (
                <p className="text-xs text-neutral-500">No active invite links.</p>
              ) : (
                invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-300 truncate">Joins as {inv.role === 'admin' ? 'Admin' : 'Member'}</div>
                      <div className="text-[10px] text-neutral-600">by {inv.createdBy.name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => copyInviteLink(inv.id)} title="Copy link" className="text-neutral-500 hover:text-blue-400 cursor-pointer">
                        {copiedId === inv.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => revokeInvite(inv.id)} title="Revoke link" className="text-neutral-500 hover:text-red-400 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : sub === 'import' ? (
          <div className="p-5 space-y-3 h-96 overflow-y-auto">
            <p className="text-[11px] text-neutral-500">
              Import a ClickUp CSV export (Everything view → Export). Spaces, Folders, Lists, and Statuses referenced in the file are matched by name or created; existing ones are reused, never duplicated.
            </p>

            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-1.5 justify-center border border-neutral-700 hover:border-neutral-600 text-neutral-300 text-xs py-2 rounded cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" /> {csvFileName || 'Choose CSV file...'}
            </button>

            {importPreview && (
              <div className="bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2.5 space-y-1 text-xs text-neutral-300">
                <div>{importPreview.taskCount} tasks will be created{importPreview.skippedCount > 0 && `, ${importPreview.skippedCount} rows skipped (missing name/list)`}</div>
                <div className="text-neutral-500">{importPreview.spaceNames.size} Spaces · {importPreview.folderPaths.size} Folder paths · {importPreview.listNames.size} Lists · {importPreview.statusNames.size} Statuses</div>
                <div className="text-neutral-500">
                  Assignees: {importPreview.matchedAssignees.size} matched to workspace members
                  {importPreview.unmatchedAssignees.size > 0 && `, ${importPreview.unmatchedAssignees.size} unmatched (will be skipped): ${[...importPreview.unmatchedAssignees].join(', ')}`}
                </div>
                <button
                  onClick={confirmImport}
                  disabled={importBusy}
                  className="w-full mt-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs py-1.5 rounded font-medium cursor-pointer"
                >
                  {importBusy ? 'Importing…' : 'Confirm import'}
                </button>
              </div>
            )}

            {importError && <p className="text-[11px] text-red-400">{importError}</p>}

            {importResult && (
              <div className="bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2.5 space-y-1 text-xs text-neutral-300">
                <div className="text-green-400 font-medium">Import complete</div>
                <div>{importResult.tasksCreated} tasks, {importResult.spacesCreated} Spaces, {importResult.foldersCreated} Folders, {importResult.listsCreated} Lists, {importResult.statusesCreated} Statuses created</div>
                {importResult.unmatchedAssignees.length > 0 && (
                  <div className="text-amber-400">Unmatched assignees (skipped): {importResult.unmatchedAssignees.join(', ')}</div>
                )}
                {importResult.skippedRows.length > 0 && (
                  <div className="text-neutral-500">{importResult.skippedRows.length} rows skipped</div>
                )}
              </div>
            )}
          </div>
        ) : section === 'you' ? (
          <div className="px-4 pb-4 space-y-1 h-[26rem] overflow-y-auto">
            {/* Who you are, first and large — the same thing ClickUp puts at the top of this
                panel, and for the same reason: a settings screen that opens on a list of switches
                never says whose settings they are. Edit profile is its own button rather than a row
                in the list below, because it is the one action here that opens a whole screen. */}
            {user && (
              <div className="flex flex-col items-center text-center pt-1 pb-4">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt={user.name} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <span
                    className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.initials}
                  </span>
                )}
                <p className="mt-2.5 text-base font-bold text-app-strong">{user.name}</p>
                {(user.username || user.googleEmail) && (
                  <p className="text-[11px] text-neutral-500">
                    {user.username ? `@${user.username}` : user.googleEmail}
                  </p>
                )}
                {onEditProfile && (
                  <button
                    onClick={() => {
                      onEditProfile();
                      onClose();
                    }}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800/60 active:scale-95 transition duration-100 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit profile
                  </button>
                )}
              </div>
            )}
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Appearance</div>
            <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5 mb-3">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemePref(setThemePreference(value))}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded cursor-pointer transition ${
                    themePref === value ? 'bg-neutral-800 text-app-strong' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Vibration on tap. Gated on the app's own useIsMobile() rather than a navigator
                probe: desktop Chrome exposes navigator.vibrate (so checking the API alone left the
                control visible on desktop), and maxTouchPoints — the second attempt — is no better,
                since plenty of Windows desktops report a nonzero value with no touchscreen
                attached. Reported twice: "haptics settings trenger ikke være på desktop."
                useIsMobile matches viewport width OR a coarse pointer, which is the same signal
                every other mobile/desktop split in this app already uses, so this can't drift from
                them. Still ANDed with the API check because iOS is touch but has no
                navigator.vibrate at all.
                Picking an option fires a pulse at that strength immediately (see
                setHapticStrength), so the difference is felt while choosing rather than only on
                some later unrelated tap. */}
            {/* Inside the native app the platform's own haptics are used instead of
                navigator.vibrate (see lib/haptics.ts), and iOS has never implemented that API at
                all — so gating purely on it would have hidden this setting on exactly the device
                where the app finally makes haptics possible. */}
            {(Capacitor.isNativePlatform() ||
              (isMobile && typeof navigator !== 'undefined' && 'vibrate' in navigator)) && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Haptics</div>
                <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5 mb-3">
                  {HAPTIC_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setHapticStrength(value);
                        setHaptics(value);
                      }}
                      className={`flex-1 text-[11px] py-1.5 rounded cursor-pointer transition ${
                        haptics === value ? 'bg-neutral-800 text-app-strong' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <HapticDiagnostics strength={haptics} />
              </>
            )}
            {/* The Home-and-Office / classic switch used to sit here. It is gone: which navigation
                you get is which surface you are on, not a preference — see app/page.tsx's
                `useContexts`. A setting nobody can sensibly choose is a branch with a UI on it. */}
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pt-3 pb-1">Planner</div>
            <button
              onClick={toggleWeekNumbers}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer"
            >
              <span className="text-xs text-neutral-300">Show week numbers</span>
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  !weekNumbersHidden ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                }`}
              >
                {!weekNumbersHidden && <Check className="w-3 h-3 text-app-strong" />}
              </span>
            </button>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pt-3 pb-1">Notifications</div>
            <div className="px-2 py-1.5">
              {pushStatus === 'loading' ? (
                <p className="text-xs text-neutral-500">Checking…</p>
              ) : pushStatus === 'unsupported' ? (
                /* On an iPhone "not supported in this browser" is both untrue and a dead end. iOS
                   does support web push — but only for a site added to the Home Screen, never for a
                   Safari tab, so what someone needs here is the way forward, not a verdict.
                   Reported from a colleague's iPhone; every iPhone user would have hit the same
                   wall with nothing telling them what to do about it. */
                <PushUnsupportedNote />
              ) : (
                <button
                  onClick={async () => {
                    setPushError(null);
                    if (pushStatus === 'subscribed') {
                      await disablePush();
                      setPushStatus('not-subscribed');
                    } else {
                      const result = await enablePush();
                      if (result.ok) setPushStatus('subscribed');
                      else setPushError(result.error || 'Could not enable notifications');
                    }
                  }}
                  className={`w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded font-medium cursor-pointer ${
                    pushStatus === 'subscribed'
                      ? 'border border-neutral-700 text-neutral-300 hover:border-neutral-600'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {pushStatus === 'subscribed' ? 'Disable push notifications' : 'Enable push notifications'}
                </button>
              )}
              {/* Only once something is registered — offering a test before there is anywhere to
                  send it would just produce a confusing failure. */}
              {pushStatus === 'subscribed' && (
                <button
                  onClick={async () => {
                    setPushTest('Sending…');
                    try {
                      const res = await fetch('/api/push/test', { method: 'POST' });
                      const data = await res.json().catch(() => null);
                      if (!res.ok) {
                        setPushTest(data?.error || 'Could not send a test notification');
                        return;
                      }
                      // Naming what it was sent to is the useful part. If this says "1 phone" and
                      // nothing arrives, the problem is delivery; if it says "0 phones", this
                      // device was never registered and that is the thing to fix.
                      const parts: string[] = [];
                      if (data?.devices) parts.push(`${data.devices} phone${data.devices === 1 ? '' : 's'}`);
                      if (data?.browsers) parts.push(`${data.browsers} browser${data.browsers === 1 ? '' : 's'}`);
                      setPushTest(`Sent to ${parts.join(' and ')}. Background the app to see it.`);
                    } catch {
                      setPushTest('Could not reach the server');
                    }
                  }}
                  className="w-full mt-1.5 text-xs py-1.5 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-600 cursor-pointer"
                >
                  Send a test notification
                </button>
              )}
              {pushTest && <p className="text-[11px] text-neutral-400 mt-1">{pushTest}</p>}
              {pushError && <p className="text-[11px] text-red-400 mt-1">{pushError}</p>}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pt-3 pb-1">Account</div>
            {user ? (
              <>
                <button
                  onClick={onCopyCalendarLink}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
                >
                  <Link2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-300">Copy personal calendar feed link</span>
                </button>
                <a
                  href={user.googleEmail ? undefined : '/api/google/oauth/start'}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition ${
                    user.googleEmail ? '' : 'hover:bg-neutral-800/60 cursor-pointer'
                  }`}
                >
                  <Share2 className={`w-3.5 h-3.5 shrink-0 ${user.googleEmail ? 'text-green-500' : 'text-neutral-400'}`} />
                  <span className="text-xs text-neutral-300">
                    {user.googleEmail
                      ? `Google connected as ${user.googleEmail} — Docs export & Calendar sync`
                      : 'Connect Google account for Docs export & Calendar sync'}
                  </span>
                </a>
                <InstallRow />
                <AndroidAppRow />
              </>
            ) : (
              <p className="text-xs text-neutral-500 px-1 py-1">Signed-out session — try reloading the page.</p>
            )}
            <button
              onClick={() => {
                setSection('workspace');
                setSub(null);
              }}
              className="w-full mt-2 flex items-center gap-2.5 px-3 py-3 rounded-xl border border-neutral-800 bg-neutral-950/40 hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
            >
              <Building2 className="w-4 h-4 text-neutral-500 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-300">Workspace settings — roles, invites, import</span>
              </span>
              <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-1 h-[26rem] overflow-y-auto">
            {/* The work profile, given the same treatment as yours on the other side: the mark
                large, the name under it, and one button into the details. The user asked for the
                symmetry directly — a workspace is a thing with an identity too, and the panel
                should say so before it starts listing switches. */}
            {!workspace.isPersonal && (
              <div className="flex flex-col items-center text-center pt-1 pb-4">
                {workspace.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={workspace.avatarUrl} alt={workspace.name} className="w-20 h-20 rounded-2xl object-cover" />
                ) : (
                  <span
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
                    style={{ backgroundColor: workspace.color ?? '#2563eb' }}
                  >
                    {workspace.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <p className="mt-2.5 text-base font-bold text-app-strong">{workspace.name}</p>
                <p className="text-[11px] text-neutral-500">
                  {workspace.members.length} {workspace.members.length === 1 ? 'member' : 'members'}
                </p>
                {canManage && (
                  <button
                    onClick={() => setSub('profile')}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800/60 active:scale-95 transition duration-100 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit work profile
                  </button>
                )}
              </div>
            )}
            {/* Who is in this workspace. It had no home at all until now: the only member list in
                the app was the checkbox grid inside an expanded Role, which is a role tool that
                happens to show names, and it is admin-only. On desktop the Office tab used to
                answer this and no longer exists; this is where that answer moved. Visible to every
                member, because "who am I working with" is not an administrative question. */}
            {!workspace.isPersonal && (
              <button
                onClick={() => setSub('members')}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
              >
                <Users className="w-4 h-4 text-neutral-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-200">People</span>
                  <span className="block text-[11px] text-neutral-500">
                    {workspace.members.length} {workspace.members.length === 1 ? 'member' : 'members'}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>
            )}
            {/* Sub-screens, not tabs. Each of these is something you go and do once and come
                back from; a tab implies a place you might sit in. Hidden for a personal workspace,
                which has nobody to govern: no roles to assign, no one to invite, no shared board to
                import into. */}
            {canManage && !workspace.isPersonal && (
              <div className="space-y-0.5">
              <button
                onClick={() => setSub('roles')}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
              >
                <Shield className="w-4 h-4 text-neutral-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-200">Roles</span>
                  <span className="block text-[11px] text-neutral-500">Who can do what in this workspace</span>
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>
              <button
                onClick={() => setSub('invite')}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
              >
                <UserPlus className="w-4 h-4 text-neutral-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-200">Invite people</span>
                  <span className="block text-[11px] text-neutral-500">By email, from your network, or a link</span>
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>
              <button
                onClick={() => setSub('import')}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
              >
                <Upload className="w-4 h-4 text-neutral-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-neutral-200">Import</span>
                  <span className="block text-[11px] text-neutral-500">Bring tasks in from a CSV export</span>
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>
              </div>
            )}
            {!canManage && !workspace.isPersonal && (
              <p className="px-1 py-2 text-[11px] text-neutral-500">
                Only workspace admins can change roles, invite people or import.
              </p>
            )}
            {workspace.isPersonal && (
              <p className="px-1 py-2 text-[11px] text-neutral-500">
                This is your personal workspace — it has no members, so there is nothing to manage
                here. Switch to a team workspace to see its settings.
              </p>
            )}
            <button
              onClick={() => {
                setSection('you');
                setSub(null);
              }}
              className="w-full mt-2 flex items-center gap-2.5 px-3 py-3 rounded-xl border border-neutral-800 bg-neutral-950/40 hover:bg-neutral-800/50 active:bg-neutral-800 cursor-pointer text-left transition"
            >
              <UserCircle className="w-4 h-4 text-neutral-500 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-neutral-300">Your settings — profile, appearance, notifications</span>
              </span>
              <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}