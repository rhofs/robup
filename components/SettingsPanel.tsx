'use client';

import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { X, Settings, Check, Trash2, Plus, Link2, Upload, Share2, Download, Monitor, Sun, Moon } from 'lucide-react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';
import { readHapticStrength, setHapticStrength, type HapticStrength } from '../lib/haptics';
import { useTaskStore, type HierarchyWorkspace, type AppUser } from '../store/useTaskStore';
import { useChatStore } from '../store/useChatStore';
import { getPushStatus, enablePush, disablePush } from '../lib/pushClient';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
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

const HIDDEN_NAV_TABS_STORAGE_KEY = 'siqt.hiddenNavTabs';

export type NavTabId = 'board' | 'calendar' | 'docs' | 'office' | 'chat';

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
  onClose,
  onChange,
  initialTab = 'general',
}: {
  workspace: HierarchyWorkspace;
  canManage: boolean;
  // Account tab's own data — personal, not workspace-scoped (see that tab's own comment below).
  user: AppUser | null;
  onCopyCalendarLink: () => void;
  onClose: () => void;
  onChange: () => void;
  // Lets a caller land directly on a specific tab — e.g. Office's own "Invite" entry point opens
  // straight to 'invite' instead of making someone click through from 'general' every time.
  initialTab?: 'general' | 'roles' | 'invite' | 'import' | 'account';
}) {
  const { createRole, updateRole, deleteRole, assignRole, unassignRole, updateWorkspaceDetails, sendWorkspaceMemberInvite } = useTaskStore();
  const { connections, fetchConnections } = useChatStore();
  const [tab, setTab] = useState<'general' | 'roles' | 'invite' | 'import' | 'account'>(initialTab);
  const [hidden, setHidden] = useState(() => readHiddenNavTabs());
  const [weekNumbersHidden, setWeekNumbersHidden] = useState(() => readHideWeekNumbers());
  // Lazy initializer, not a useState(default) + useEffect correction — this panel is mounted
  // fresh each time it opens, and a one-tick-late correction would visibly flip the selected
  // segment (same class of bug as useIsMobile's own documented flash-of-wrong-value).
  const [themePref, setThemePref] = useState<ThemePreference>(() => readThemePreference());
  const [haptics, setHaptics] = useState<HapticStrength>(() => readHapticStrength());

  // --- Workspace identity (backlog #2) --- org type + work email, set at creation, editable
  // here by Owner/Admin only (server-enforced too, see PATCH /api/workspaces/[id]/route.ts).
  const [emailDraft, setEmailDraft] = useState(workspace.workEmail ?? '');
  const [editingEmail, setEditingEmail] = useState(false);

  // --- Push notifications --- per-browser, not per-account (a phone and a laptop are two
  // separate subscriptions) — see lib/pushClient.ts.
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'subscribed' | 'not-subscribed' | 'loading'>('loading');
  const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  const toggle = (tabId: NavTabId) => {
    const next = !hidden.has(tabId);
    setNavTabHidden(tabId, next);
    setHidden(readHiddenNavTabs());
    onChange();
  };

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

  const refetchDirectPending = () => {
    fetch(`/api/workspaces/${workspace.id}/member-invites`)
      .then((r) => r.json())
      .then(setDirectPending)
      .catch(() => setDirectPending([]));
  };

  useEffect(() => {
    if (tab !== 'invite' || !canManage) return;
    fetch(`/api/workspaces/${workspace.id}/invites`)
      .then((r) => r.json())
      .then(setInvites)
      .catch(() => setInvites([]));
    refetchDirectPending();
    fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canManage, workspace.id]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-app-strong flex items-center gap-1.5">
            <Settings className="w-4 h-4" /> Settings
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-app-strong cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex border-b border-neutral-800">
          <button
            onClick={() => setTab('general')}
            className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'general' ? 'text-app-strong border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            General
          </button>
          {canManage && (
            <button
              onClick={() => setTab('roles')}
              className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'roles' ? 'text-app-strong border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Roles
            </button>
          )}
          {/* A personal workspace has no invite concept — it's inherently single-member/private
              (the "My tasks" auto-created Workspace), so a shareable join link here would be a
              real leak, not just clutter. */}
          {canManage && !workspace.isPersonal && (
            <button
              onClick={() => setTab('invite')}
              className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'invite' ? 'text-app-strong border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Invite
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setTab('import')}
              className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'import' ? 'text-app-strong border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Import
            </button>
          )}
          {/* Personal/account-level, so open to everyone regardless of canManage — unlike every
              other tab here, it has nothing to do with *this* workspace specifically. */}
          <button
            onClick={() => setTab('account')}
            className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'account' ? 'text-app-strong border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            Account
          </button>
        </div>

        {tab === 'general' ? (
          <div className="p-4 space-y-1">
            {!workspace.isPersonal && (
              <>
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

            {/* Vibration on tap — Android/Chrome only (including installed PWAs); iOS has no
                navigator.vibrate at all, so the row is hidden there rather than offering a
                control that provably can't do anything. Picking an option fires a pulse at that
                strength immediately (see setHapticStrength), so the difference is felt while
                choosing instead of only on some later tap. */}
            {typeof navigator !== 'undefined' && 'vibrate' in navigator && (
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
              </>
            )}

            <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Visible tabs</div>
            {NAV_TABS.map((navTab) => {
              const visible = !hidden.has(navTab.id);
              return (
                <button
                  key={navTab.id}
                  onClick={() => toggle(navTab.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer"
                >
                  <span className="text-xs text-neutral-300">{navTab.label}</span>
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      visible ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                    }`}
                  >
                    {visible && <Check className="w-3 h-3 text-app-strong" />}
                  </span>
                </button>
              );
            })}

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
                <p className="text-xs text-neutral-500">Push notifications aren't supported in this browser.</p>
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
              {pushError && <p className="text-[11px] text-red-400 mt-1">{pushError}</p>}
            </div>
          </div>
        ) : tab === 'roles' ? (
          <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
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
        ) : tab === 'invite' ? (
          <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
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
        ) : tab === 'import' ? (
          <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
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
        ) : (
          // Account tab — personal/account-level settings, not workspace-scoped like every tab
          // above it (still lives in this same panel per explicit request: one Settings surface,
          // not two separate ones). Absorbed from the now-deleted standalone
          // AccountSettingsPanel.tsx, which had its own real problem: its only trigger lived in
          // the desktop-only sidebar user-menu dropdown, so mobile had no way to reach Connect
          // Google at all. This tab is reachable from the exact same "Settings" entry point every
          // other tab already is, on both desktop and mobile.
          <div className="p-3 space-y-1">
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
              </>
            ) : (
              <p className="text-xs text-neutral-500 px-1 py-1">Signed-out session — try reloading the page.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
