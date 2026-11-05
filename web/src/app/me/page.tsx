
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { srcEmployee, stepSchedule, mailOutbox } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { GRADES } from "@/lib/codes";

export default async function MePage() {
  const me = await requireRole("EMPLOYEE");
  if (!me.empNo) notFound();
  const [employee] = await db.select().from(srcEmployee).where(eq(srcEmployee.empNo, me.empNo));
  if (!employee) notFound();
  const [schedule] = await db.select().from(stepSchedule).where(eq(stepSchedule.empNo, me.empNo));
  const mails = await db.select().from(mailOutbox).where(eq(mailOutbox.toEmpNo, me.empNo))
    .orderBy(desc(mailOutbox.createdAt), desc(mailOutbox.mailId)).limit(3);
  return <main className="space-y-6 p-6">
    <h1 className="text-2xl font-bold">내 승진·승급 현황</h1>
    <h2 className="text-xl font-semibold">{employee.name}님의 승급 정보</h2>
    <dl className="grid grid-cols-2 gap-3 rounded border p-4">
      <dt>직급</dt><dd>{GRADES.find((g) => g.code === employee.grade)?.label ?? employee.grade}</dd>
      <dt>호봉</dt><dd>{employee.step}호봉</dd>
      <dt>현 호봉 승급일</dt><dd>{employee.stepDate}</dd>
      <dt>확정 차기승급일</dt><dd>{schedule?.confirmedDate ?? "확정 전"}</dd>
    </dl>
    <section className="space-y-3"><h2 className="text-xl font-semibold">최근 메일 3건</h2>
      {!mails.length && <p>받은 메일이 없습니다.</p>}
      {mails.map((mail) => <details key={mail.mailId} className="rounded border p-4"><summary>{mail.subject}</summary><time dateTime={mail.createdAt}>{mail.createdAt}</time><p className="whitespace-pre-wrap">{mail.body}</p></details>)}
      <Link href="/me/mails">내 메일함 전체 보기</Link>
    </section><Link href="/me/promotion">내 승진 신청서</Link>
  </main>;
}
