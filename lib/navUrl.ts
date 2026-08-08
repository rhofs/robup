import { startOfDay } from './calendarDates';

export type NavGranularity = 'month' | 'week' | 'day';
export type NavView = 'board' | 'calendar' | 'docs' | 'office' | 'mytasks' | 'mypersonal' | 'profile';

// `workspaceId`/`spaceId`/`listIds` are nullable — null means the URL simply didn't mention them
// at all, which is distinct from an explicit `space=everything`. That distinction lets a bare
// first visit to `/` keep the app's existing "auto-select the first Space" behavior instead of a
// parser forcing it back to 'everything'. Every other field always resolves to a concrete default
// when absent, since forcing those is already today's real default behavior.
export type ParsedNavUrl = {
  view: NavView;
  workspaceId: string | null;
  spaceId: string | null;
  listIds: string[] | null;
  modalStack: string[];
  granularity: NavGranularity;
  focusDate: Date;
  docFolderId: string | null;
  docId: string | null;
  officeUserId: string | null;
  officeRoomId: string | null;
};

export type NavState = {
  view: NavView;
  workspaceId: string | null;
  spaceId: string;
  listIds: string[];
  modalStack: string[];
  granularity: NavGranularity;
  focusDate: Date;
  docFolderId: string | null;
  docId: string | null;
  officeUserId: string | null;
  officeRoomId: string | null;
};

// Local-date YYYY-MM-DD — not `toISOString()`, which is UTC and shifts the date near midnight in
// negative-UTC-offset timezones.
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseDateKey = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function parseNavUrl(params: URLSearchParams): ParsedNavUrl {
  const viewParam = params.get('view');
  const view: NavView =
    viewParam === 'calendar'
      ? 'calendar'
      : viewParam === 'docs'
        ? 'docs'
        : viewParam === 'office'
          ? 'office'
          : viewParam === 'mytasks'
            ? 'mytasks'
            : viewParam === 'mypersonal'
              ? 'mypersonal'
              : viewParam === 'profile'
                ? 'profile'
                : 'board';
  const workspaceId = params.get('workspace');
  const spaceId = params.has('space') ? params.get('space') : null;
  const listIds = params.has('lists') ? (params.get('lists') || '').split(',').filter(Boolean) : null;
  const modalStack = (params.get('modal') || '').split(',').filter(Boolean);
  const granularityRaw = params.get('cal');
  const granularity: NavGranularity = granularityRaw === 'week' || granularityRaw === 'day' ? granularityRaw : 'month';
  const dateParam = params.get('date');
  const focusDate = (dateParam && parseDateKey(dateParam)) || startOfDay(new Date());
  const docFolderId = params.get('docFolder');
  const docId = params.get('doc');
  const officeUserId = params.get('officeUser');
  const officeRoomId = params.get('officeRoom');
  return { view, workspaceId, spaceId, listIds, modalStack, granularity, focusDate, docFolderId, docId, officeUserId, officeRoomId };
}

// Always-explicit canonical serialization of a fully-resolved nav state (as opposed to
// `ParsedNavUrl`, which preserves "the URL didn't say" as null for the caller to interpret).
export function buildNavQueryString(state: NavState): string {
  const params = new URLSearchParams();
  if (state.view !== 'board') params.set('view', state.view);
  if (state.workspaceId) params.set('workspace', state.workspaceId);
  if (state.spaceId !== 'everything') params.set('space', state.spaceId);
  if (state.listIds.length > 0) params.set('lists', [...state.listIds].sort().join(','));
  if (state.modalStack.length > 0) params.set('modal', state.modalStack.join(','));
  if (state.granularity !== 'month') params.set('cal', state.granularity);
  if (dateKey(state.focusDate) !== dateKey(startOfDay(new Date()))) params.set('date', dateKey(state.focusDate));
  if (state.docFolderId) params.set('docFolder', state.docFolderId);
  if (state.docId) params.set('doc', state.docId);
  if (state.officeUserId) params.set('officeUser', state.officeUserId);
  if (state.officeRoomId) params.set('officeRoom', state.officeRoomId);
  return params.toString();
}
