import Link from "next/link";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { application, correctionRequest, promotionRound, stepSchedule } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { APP_STATUS, COMPARE_STATUS, ROUND_STATUS } from "@/lib/codes";

export default async function HrPage() {
  await requireRole("HR");
  const rounds = await db.select().from(promotionRound).where(ne(promotionRound.status, "RESULT")).orderBy(promotionRound.roundId);
  const counts = await db.select({ roundId: application.roundId, status: application.status, count: sql<number>`count(*)` }).from(application).groupBy(application.roundId, application.status);
  const [pending] = await db.select({ count: sql<number>`count(*)` }).from(correctionRequest).where(eq(correctionRequest.status, "PENDING"));
  const comparisons = await db.select({ status: stepSchedule.compareStatus, count: sql<number>`count(*)` }).from(stepSchedule).groupBy(stepSchedule.compareStatus);
  const [review] = await db.select({ count: sql<number>`count(*)` }).from(stepSchedule).where(and(eq(stepSchedule.reviewNeeded, "Y")));
  return <main className="space-y-6 p-6"><h1 className="text-2xl font-bold">인사팀 홈</h1>
    <section className="space-y-3"><h2 className="text-xl font-semibold">진행 중 승진 회차</h2>
      {!rounds.length && <p>진행 중 회차가 없습니다.</p>}
      {rounds.map((r) => <article key={r.roundId} className="rounded border p-4"><h3><Link className="underline" href={`/hr/rounds/${r.roundId}/applications`}>{r.name}</Link> · {ROUND_STATUS[r.status as keyof typeof ROUND_STATUS]}</h3>
        <ul>{Object.entries(APP_STATUS).map(([code, label]) => <li key={code}>{label}: {counts.find((c) => c.roundId === r.roundId && c.status === code)?.count ?? 0}명</li>)}</ul>
      </article>)}
    </section>
    <p>처리 대기 정정 요청: {pending.count}건</p>
    <section><h2 className="text-xl font-semibold">차기승급일 현황</h2><ul>{Object.entries(COMPARE_STATUS).map(([code, label]) => <li key={code}><Link className="underline" href={`/hr/steps?status=${code}`}>{label}: {comparisons.find((c) => c.status === code)?.count ?? 0}명</Link></li>)}</ul><p>재확인 필요: {review.count}명</p></section>
    <Link className="underline" href="/hr/rounds">승진 회차 관리</Link>
  </main>;
}
