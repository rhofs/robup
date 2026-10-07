// Status templates: a named set of statuses that can be copied into a Space from its Edit statuses
// window, or that a new Space starts with (Workspace.defaultStatusTemplate). Built-in ones live here;
// a workspace's own are StatusTemplate rows ("Save as template"). Shared by the server (new Spaces) and
// the client (the window), so nothing here may touch the database or the DOM.

export type StatusKindName = 'open' | 'done' | 'closed';

export type TemplateStatus = { name: string; color: string; kind: StatusKindName; icon?: string | null };

export type StatusTemplateDef = { id: string; name: string; statuses: TemplateStatus[]; builtin?: boolean };

export const BUILTIN_STATUS_TEMPLATES: StatusTemplateDef[] = [
  {
    id: 'builtin:default',
    name: 'Siqt default',
    builtin: true,
    statuses: [
      { name: 'To Do', color: '#8d97a5', kind: 'open' },
      { name: 'In Progress', color: '#618cd1', kind: 'open' },
      { name: 'Review', color: '#9a61d1', kind: 'open' },
      { name: 'Done', color: '#349f7c', kind: 'done' },
    ],
  },
  {
    id: 'builtin:simple',
    name: 'Simple',
    builtin: true,
    statuses: [
      { name: 'To Do', color: '#8d97a5', kind: 'open' },
      { name: 'In Progress', color: '#618cd1', kind: 'open' },
      { name: 'Complete', color: '#349f7c', kind: 'closed' },
    ],
  },
  {
    id: 'builtin:norsk',
    name: 'Norsk',
    builtin: true,
    statuses: [
      { name: 'Ikke gjort', color: '#cd6565', kind: 'open' },
      { name: 'Påbegynt', color: '#c89642', kind: 'open' },
      { name: 'Ferdig', color: '#349f7c', kind: 'done' },
      { name: 'Slett', color: '#8d97a5', kind: 'closed' },
    ],
  },
  {
    id: 'builtin:kanban',
    name: 'Kanban',
    builtin: true,
    statuses: [
      { name: 'Backlog', color: '#8d97a5', kind: 'open' },
      { name: 'Ready', color: '#31a0b3', kind: 'open' },
      { name: 'In Progress', color: '#618cd1', kind: 'open' },
      { name: 'Review', color: '#9a61d1', kind: 'open' },
      { name: 'Done', color: '#349f7c', kind: 'done' },
      { name: 'Closed', color: '#349f7c', kind: 'closed' },
    ],
  },
  {
    id: 'builtin:scrum',
    name: 'Scrum',
    builtin: true,
    statuses: [
      { name: 'Backlog', color: '#8d97a5', kind: 'open' },
      { name: 'Scoping', color: '#c89642', kind: 'open' },
      { name: 'In Design', color: '#cb6798', kind: 'open' },
      { name: 'In Development', color: '#618cd1', kind: 'open' },
      { name: 'In Review', color: '#9a61d1', kind: 'open' },
      { name: 'Testing', color: '#31a0b3', kind: 'open' },
      { name: 'Ready for Deploy', color: '#e0803a', kind: 'done' },
      { name: 'Complete', color: '#349f7c', kind: 'closed' },
    ],
  },
];

// A template's statuses from its stored JSON — anything malformed is dropped rather than trusted.
export function parseTemplateStatuses(json: string | null | undefined): TemplateStatus[] {
  try {
    const raw = JSON.parse(json ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s.name === 'string' && s.name.trim())
      .map((s) => ({
        name: String(s.name).trim().slice(0, 60),
        color: typeof s.color === 'string' ? s.color.slice(0, 32) : '#94A3B8',
        kind: s.kind === 'done' || s.kind === 'closed' ? s.kind : 'open',
        icon: typeof s.icon === 'string' && s.icon ? s.icon.slice(0, 32) : null,
      }));
  } catch {
    return [];
  }
}
