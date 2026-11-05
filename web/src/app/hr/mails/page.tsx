import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { mailOutbox } from "@/db/schema";
import { MAIL_TYPES } from "@/lib/codes";
import { statusLabel } from "@/lib/format";
import { requireRole } from "@/lib/session";

export default async function MailsPage({ searchParams }: PageProps<"/hr/mails">) {
  await requireRole("HR");
  const filters = await searchParams;
  const type = typeof filters.type === "string" ? filters.type : "";
  const recipient = typeof filters.recipient === "string" ? filters.recipient.trim() : "";
  const mails = await db.select().from(mailOutbox).where(and(
    type ? eq(mailOutbox.mailType, type) : undefined,
    recipient ? or(eq(mailOutbox.toEmpNo, recipient), eq(mailOutbox.toEmail, recipient)) : undefined,
  )).orderBy(desc(mailOutbox.createdAt), desc(mailOutbox.mailId));

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">메일 발송함</h1>
      <p>실제 이메일 대신 저장된 메일을 확인합니다. 제목을 누르면 본문이 열립니다.</p>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="mail-type" className="block">메일 종류</label>
          <select id="mail-type" name="type" defaultValue={type} className="rounded border p-2">
            <option value="">전체</option>
            {Object.entries(MAIL_TYPES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mail-recipient" className="block">받는 사람 (사번 또는 이메일)</label>
          <input id="mail-recipient" name="recipient" defaultValue={recipient} className="rounded border p-2" />
        </div>
        <button type="submit" className="rounded border px-4 py-2">조회</button>
      </form>
      <p>총 {mails.length}건</p>
      {mails.length === 0 ? <p>메일이 없습니다.</p> : (
        <div className="space-y-3">
          {mails.map((mail) => (
            <details key={mail.mailId} className="rounded border p-4">
              <summary className="cursor-pointer font-semibold">{mail.subject}</summary>
              <div className="mt-3 space-y-2">
                <p>종류: {statusLabel(MAIL_TYPES, mail.mailType)}</p>
                <p>받는 사람: {mail.toEmpNo} ({mail.toEmail})</p>
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
