import { prisma } from '@/lib/prisma';
import { contentFromJSON } from '@/lib/collab/docContent';
import { WIKI_TEMPLATE } from './templates';

export { contentFromJSON };

export const EMPTY_PAGE = { type: 'doc', content: [{ type: 'paragraph' }] };

// One seeding at a time per workspace. Two people opening an empty wiki in the same second would
// otherwise both see "no pages" and both create the template — a single Next process, so an
// in-memory lock is enough.
const seeding = new Map<string, Promise<void>>();

// Creates the starting chapters the first time a workspace's wiki is opened. Deleted pages count as
// existing: someone who removed the template on purpose must not find it back the next day.
export async function ensureWikiSeeded(workspaceId: string): Promise<void> {
  const running = seeding.get(workspaceId);
  if (running) return running;
  const job = (async () => {
    const existing = await prisma.doc.count({ where: { wikiWorkspaceId: workspaceId } });
    if (existing > 0) return;
    await prisma.$transaction(async (tx) => {
      for (const [ci, chapter] of WIKI_TEMPLATE.entries()) {
        const created = await tx.doc.create({
          data: { wikiWorkspaceId: workspaceId, title: chapter.title, order: ci, ...contentFromJSON(chapter.body) },
        });
        for (const [pi, page] of chapter.pages.entries()) {
          await tx.doc.create({
            data: { wikiWorkspaceId: workspaceId, parentId: created.id, title: page.title, order: pi, ...contentFromJSON(page.body) },
          });
        }
      }
    });
  })().finally(() => seeding.delete(workspaceId));
  seeding.set(workspaceId, job);
  return job;
}
