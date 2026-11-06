import { PageHeader } from "@/components/ui/workspace";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { mailOutbox } from "@/db/schema";
import { MAIL_TYPES } from "@/lib/codes";
import { statusLabel } from "@/lib/format";
import { requireRole } from "@/lib/session";

export default async function MyMailsPage() {
  const me = await requireRole("EMPLOYEE");
  if (!me.empNo) notFound();
  // URL 입력으로 수신자를 바꾸지 못하도록 세션의 사번만 사용한다.
  const mails = await db.select().from(mailOutbox)
    .where(eq(mailOutbox.toEmpNo, me.empNo))
    .orderBy(desc(mailOutbox.createdAt), desc(mailOutbox.mailId));

  return (
    <main className="workspace-page">
      <PageHeader description="나에게 도착한 업무 안내 메일을 확인하세요." className="text-2xl font-bold">내 메일함</PageHeader>
      <p>{me.name}님에게 온 메일 {mails.length}건 · 제목을 누르면 본문이 열립니다.</p>
      {mails.length === 0 ? <p>받은 메일이 없습니다.</p> : (
        <div className="space-y-3">
          {mails.map((mail) => (
            <details key={mail.mailId} className="rounded border p-4">
              <summary className="cursor-pointer font-semibold">{mail.subject}</summary>
              <div className="mt-3 space-y-2">
                <p>종류: {statusLabel(MAIL_TYPES, mail.mailType)}</p>
                <p>받는 주소: {mail.toEmail}</p>
                <p>발송일시: <time dateTime={mail.createdAt}>{mail.createdAt}</time></p>
                <p className="whitespace-pre-wrap break-words">{mail.body}</p>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
