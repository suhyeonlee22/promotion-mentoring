import { requireRole } from "@/lib/session";
import { listNotifications } from "@/services/notifications";
import { openNotificationAction } from "./actions";

export default async function NotificationsPage({ searchParams }: PageProps<"/hr/notifications">) {
  const me = await requireRole("HR");
  const rows = await listNotifications(me);
  const { error } = await searchParams;
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-bold">알림함</h1>
    {typeof error === "string" && <p role="alert">{error}</p>}
    {!rows.length && <p>알림이 없습니다.</p>}
    {rows.map((n) => <article key={n.notiId} className="space-y-2 rounded border p-4">
      <p>{n.readYn === "N" ? "안 읽음" : "읽음"} · <time dateTime={n.createdAt}>{n.createdAt}</time></p>
      <form action={openNotificationAction}><input type="hidden" name="notiId" value={n.notiId}/><button className="text-left font-semibold underline">{n.title}</button></form><p>{n.body}</p>
    </article>)}
  </main>;
}
