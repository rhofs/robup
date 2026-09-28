// Where a notification opens — the app's own URL for that place, the same one lib/navUrl.ts reads
// on a refresh or a back/forward, so opening it needs no special handling: the page navigates there
// as it would for any link to itself. Chat pushes used to carry '/', so tapping one opened the app
// on whatever screen it last showed rather than on the conversation.
export const chatUrl = (channelId: string) => `/?view=chat&chat=${encodeURIComponent(channelId)}`;
export const taskUrl = (taskId: string) => `/?modal=${encodeURIComponent(taskId)}`;
