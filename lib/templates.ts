// The only place that knows what a template's payload looks like.
//
// The payload is stored as JSON in one column, so the shape is a convention rather than something
// the database enforces. Keeping every read and write behind these functions is what makes that
// safe: a template written by an older version of the app is parsed by the same code that will
// render it, and a missing field is a default rather than a crash.
// No priority: the column exists in the schema and nothing in the app reads or writes it, so
// carrying it here would be a field that silently does nothing — worse than an absent one, because
// it looks like it works.
export type TaskTemplatePayload = {
  title: string;
  description: string | null;
  status: string | null;
  // The reason templates are worth having at all: a checklist you rebuild by hand every time is the
  // thing people want back. Only titles — a subtask's dates and assignees belong to the instance,
  // not to the shape of the work.
  subtasks: string[];
};

export type DocTemplatePayload = {
  title: string;
  content: string;
};

export type TemplateKind = 'task' | 'doc';

export type AppTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  payloadJson: string;
  createdAt: string;
};

// Deliberately total: anything unparseable or from a future shape comes back as an empty template
// rather than throwing. A template is a convenience, and a convenience that can break the screen it
// is on is worse than one that is occasionally blank.
export function parseTaskTemplate(payloadJson: string): TaskTemplatePayload {
  try {
    const raw = JSON.parse(payloadJson);
    return {
      title: typeof raw?.title === 'string' ? raw.title : '',
      description: typeof raw?.description === 'string' ? raw.description : null,
      status: typeof raw?.status === 'string' ? raw.status : null,
      subtasks: Array.isArray(raw?.subtasks) ? raw.subtasks.filter((t: unknown) => typeof t === 'string') : [],
    };
  } catch {
    return { title: '', description: null, status: null, subtasks: [] };
  }
}

export function parseDocTemplate(payloadJson: string): DocTemplatePayload {
  try {
    const raw = JSON.parse(payloadJson);
    return {
      title: typeof raw?.title === 'string' ? raw.title : '',
      content: typeof raw?.content === 'string' ? raw.content : '',
    };
  } catch {
    return { title: '', content: '' };
  }
}
