import { prisma } from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

// One place that creates a notification and sends the matching push.
//
// Both, always, from the same call. Before this, push existed only for chat messages and knew
// nothing about anything else, so adding an event meant remembering to do two unrelated things in
// two unrelated files — which is the shape of a bug that shows up as "I got the push but the app
// says nothing", or the reverse, weeks later. One function means the two cannot drift.
//
// Never notifies the actor about their own action. Assigning yourself a task is the single most
// common way to use assignment, and being told about it is noise that teaches people to ignore the
// bell — which costs more than the one real notification it would otherwise deliver.
export async function notify(params: {
  userIds: string[];
  actorId: string | null;
  type: string;
  title: string;
  body?: string | null;
  taskId?: string | null;
  url?: string;
}): Promise<void> {
  const recipients = [...new Set(params.userIds)].filter((id) => id && id !== params.actorId);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      actorId: params.actorId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      taskId: params.taskId ?? null,
    })),
  });

  // Deliberately not awaited into the caller's critical path — a push provider being slow or down
  // must not make assigning a task slow or fail. The row is already written, so the notification
  // survives a failed push and the person still sees it next time they open the app.
  for (const userId of recipients) {
    sendPushToUser(userId, {
      title: params.title,
      body: params.body ?? '',
      url: params.url ?? '/',
    }).catch(() => {});
  }
}
