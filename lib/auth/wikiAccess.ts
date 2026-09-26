import { prisma } from '@/lib/prisma';
import { getAccessContext } from '@/lib/auth/access';
import { parseAccessJson, type AccessContext } from '@/lib/auth/visibility';

// Who may read and who may edit a workspace's Wiki.
//
// Reading: every member. A wiki is where "everyone in the company knows they can find it" — the
// user's own words — so it has no privacy of its own; anything that must not be read by all belongs
// somewhere with access control, not in the wiki.
//
// Editing: owners and admins always, plus whoever is listed in Workspace.wikiEditorsJson — people
// or roles, the same {type, id} entries accessJson uses. Decided by the user: "Owner og admin kan
// redigere i utgangspunktet, men … man også kan tildele at roller kan redigere, eventuelt personer."
//
// Enforced in three places that must agree: the wiki API routes, the generic /api/docs/[id] route
// (so a wiki page cannot be edited through the back door), and the collab server, which opens a
// non-editor's connection read-only — the editor UI hiding its toolbar is not the protection.
export function canEditWikiWith(ctx: AccessContext, editorsJson: string): boolean {
  if (!ctx.isMember) return false;
  if (ctx.isManager) return true;
  return parseAccessJson(editorsJson).some(
    (e) => (e.type === 'user' && e.id === ctx.userId) || (e.type === 'role' && ctx.heldRoleIds.includes(e.id))
  );
}

export async function getWikiAccess(workspaceId: string, userId: string) {
  const [ctx, ws] = await Promise.all([
    getAccessContext(workspaceId, userId),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { wikiEditorsJson: true, wikiFeedbackListId: true, isPersonal: true, wikiEnabled: true },
    }),
  ]);
  // A workspace that has the wiki switched off has no wiki as far as anyone can tell — every wiki
  // route answers as if it did not exist. The pages are kept, and come back when it is switched on.
  if (!ws || !ctx.isMember || !ws.wikiEnabled) return null;
  return { ctx, ws, canEdit: canEditWikiWith(ctx, ws.wikiEditorsJson) };
}

// For a page id: the page, its workspace's access, or null when it is not a wiki page the caller
// can read.
export async function getWikiPageAccess(docId: string, userId: string) {
  const doc = await prisma.doc.findUnique({ where: { id: docId } });
  if (!doc?.wikiWorkspaceId) return null;
  const access = await getWikiAccess(doc.wikiWorkspaceId, userId);
  if (!access) return null;
  return { doc, ...access };
}
