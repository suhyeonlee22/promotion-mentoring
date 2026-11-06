import { Button } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/workspace";
import { requireRole } from "@/lib/session";
import { listNotifications } from "@/services/notifications";
import { openNotificationAction } from "./actions";

export default async function NotificationsPage({ searchParams }: PageProps<"/hr/notifications">) {
  const me = await requireRole("HR");
  const rows = await listNotifications(me);
  const { error } = await searchParams;
  return <main className="workspace-page"><PageHeader description="본인과 인사팀의 업무 알림을 확인합니다." className="text-2xl font-bold">알림함</PageHeader>
    {typeof error === "string" && <p role="alert">{error}</p>}
    {!rows.length && <p>알림이 없습니다.</p>}
    {rows.map((n) => <article key={n.notiId} className="space-y-2 rounded border p-4">
      <p>{n.readYn === "N" ? "안 읽음" : "읽음"} · <time dateTime={n.createdAt}>{n.createdAt}</time></p>
      <form action={openNotificationAction}><input type="hidden" name="notiId" value={n.notiId}/><Button className="text-left font-semibold underline">{n.title}</Button></form><p>{n.body}</p>
    </article>)}
  </main>;
}
