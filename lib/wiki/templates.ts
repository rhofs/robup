// The pages a new Wiki starts with: the four areas the user asked for, as chapters with empty
// templates under them — headings to fill in and a line of guidance each, in English like the rest
// of the app ("Hele appen skal være engelsk"). Written as ProseMirror JSON so they arrive with real
// headings and lists; the wiki API turns each into the page's Yjs content once, at creation.
//
// "Quick links" is not a chapter here: its bug report, feature request and contact buttons are real
// actions, drawn by the wiki itself, not text on a page.
//
// Only the Keyboard shortcuts page carries real content, because it is about Siqt itself and every
// workspace would otherwise have to write the same list — and it only lists shortcuts that exist.

type Node = Record<string, unknown>;

const text = (t: string, marks?: string[]): Node => ({ type: 'text', text: t, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const p = (...content: Node[]): Node => ({ type: 'paragraph', content });
const hint = (t: string) => p(text(t, ['italic']));
const h = (level: 1 | 2, t: string): Node => ({ type: 'heading', attrs: { level }, content: [text(t)] });
const ul = (...items: (string | Node[])[]): Node => ({
  type: 'bulletList',
  content: items.map((it) => ({ type: 'listItem', content: [p(...(typeof it === 'string' ? [text(it)] : it))] })),
});
const ol = (...items: string[]): Node => ({
  type: 'orderedList',
  content: items.map((it) => ({ type: 'listItem', content: [p(text(it))] })),
});
const doc = (...content: Node[]): Node => ({ type: 'doc', content });
const key = (k: string) => text(k, ['bold']);

export type WikiTemplatePage = { title: string; body: Node };
export type WikiTemplateChapter = WikiTemplatePage & { pages: WikiTemplatePage[] };

export const WIKI_TEMPLATE: WikiTemplateChapter[] = [
  {
    title: 'Getting started',
    body: doc(hint('Everything someone new needs in their first week. Start here.')),
    pages: [
      {
        title: 'Welcome',
        body: doc(
          h(2, 'Who we are'),
          hint('A few lines about the company and what this workspace is for.'),
          h(2, 'Who to ask'),
          hint('Name the people a newcomer can go to, and for what.')
        ),
      },
      {
        title: 'Your first three steps',
        body: doc(
          hint('A short checklist for everyone who is invited to the workspace.'),
          ol('Complete your profile — photo, title and phone number.', 'Find your Spaces and the Lists you work in.', 'Set up notifications the way you want them (see "Notifications without the noise").')
        ),
      },
      {
        title: 'How our workspace is organized',
        body: doc(
          hint('Explain the structure, so people know where things go.'),
          h(2, 'Spaces'),
          hint('What each Space is for.'),
          h(2, 'Folders and Lists'),
          hint('How work is grouped inside a Space, and naming conventions.'),
          h(2, 'Docs'),
          hint('Where documents live and how they are named.')
        ),
      },
    ],
  },
  {
    title: 'How we work',
    body: doc(hint('The team\'s own rules — how we use the tool together.')),
    pages: [
      {
        title: 'Statuses, tags and labels',
        body: doc(
          hint('What each status means here, and when a task moves to the next one.'),
          h(2, 'Statuses'),
          ul('To Do — ', 'In progress — ', 'Done — '),
          h(2, 'Tags and custom fields'),
          hint('Which ones we use, and what they mean.')
        ),
      },
      {
        title: 'Updating tasks and deadlines',
        body: doc(
          hint('What we expect: how often tasks are updated, and what a due date means.'),
          h(2, 'Updates'),
          hint('For example: move your task when its status changes, and comment when something is blocked.'),
          h(2, 'Deadlines'),
          hint('For example: a due date is a promise — say so in the task as soon as it will slip.')
        ),
      },
      {
        title: 'Who owns what',
        body: doc(
          hint('Who is responsible for which processes — so nobody has to guess.'),
          ul('Approving designs — ', 'Publishing — ', 'Budgets and purchases — ', 'Equipment — ')
        ),
      },
    ],
  },
  {
    title: 'Using Siqt',
    body: doc(hint('How the platform works — answers to the questions everyone asks once.')),
    pages: [
      {
        title: 'Notifications without the noise',
        body: doc(
          h(2, 'Mute a channel'),
          hint('Describe how your team uses muting.'),
          p(text('A muted channel stops notifying you about new messages, but you are still notified when someone mentions you by name.')),
          h(2, 'Mentions'),
          p(text('Use '), key('@name'), text(' to reach one person, '), key('@everyone'), text(' for everyone who can see the task or channel, '), key('@assignee'), text(' for the people on a task, and '), key('@Role'), text(' for a role.')),
          hint('Add your team\'s rule of thumb for when @everyone is okay.')
        ),
      },
      {
        title: 'Roles and permissions',
        body: doc(
          h(2, 'Owner and admins'),
          p(text('See everything in the workspace, manage members and roles, and can make Spaces, Folders, Lists and tasks private.')),
          h(2, 'Members'),
          p(text('See everything that is not private, and private things they have been given access to — directly or through a role.')),
          h(2, 'Roles'),
          hint('List the roles in this workspace and what each is for.')
        ),
      },
      {
        title: 'Keyboard shortcuts',
        body: doc(
          ul(
            [key('Ctrl/⌘ + K'), text(' — search everything')],
            [key('Ctrl/⌘ + Z'), text(' — undo · '), key('Ctrl/⌘ + Shift + Z'), text(' — redo')],
            [key('N'), text(' — new task (in the Planner)')],
            [key('/'), text(' — commands in a doc (headings, lists, images, subpages)')],
            [key('@'), text(' — mention a person, task, doc or file · '), key('#'), text(' — mention a task (in chat)')],
            [key('Enter'), text(' — send · '), key('Shift + Enter'), text(' — new line')],
            [key('Ctrl/⌘ + click'), text(' a List — show several Lists at once · '), key('Shift + click'), text(' — a range')]
          )
        ),
      },
    ],
  },
];
