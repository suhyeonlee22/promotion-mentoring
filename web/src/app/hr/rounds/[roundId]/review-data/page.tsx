import { and, asc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { application, applicationItem, promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { getClientIp, recordAccess } from "@/lib/access-log";
import PrintButton from "./print-button";
import styles from "./review-data.module.css";

// 같은 서버 렌더 요청의 중복 호출만 합치고, 다음 열람은 새로 기록한다.
const recordPrint = cache(async (
  userId: string, ip: string, roundId: number, subjects: string,
) => {
  const empNos: string[] = JSON.parse(subjects);
  await recordAccess({
    userId, ip,
    subjectEmpNo: empNos.length === 1 ? empNos[0] : null,
    action: "PRINT",
    target: `SCR-06 심사자료 인쇄 (회차 #${roundId}, ${empNos.length}명)`,
  });
});

export default async function ReviewDataPage({
  params,
}: PageProps<"/hr/rounds/[roundId]/review-data">) {
  const me = await requireRole("HR");
  const roundId = Number((await params).roundId);
  if (!Number.isSafeInteger(roundId) || roundId <= 0) notFound();
  const [round] = await db.select().from(promotionRound)
    .where(eq(promotionRound.roundId, roundId));
  if (!round) notFound();
  const apps = await db.select().from(application).where(and(
    eq(application.roundId, roundId), eq(application.status, "CONFIRMED"),
  )).orderBy(asc(application.empNo));
  const items = apps.length === 0 ? [] : await db.select().from(applicationItem)
    .where(inArray(applicationItem.appId, apps.map((app) => app.appId)))
    .orderBy(asc(applicationItem.sortOrder));

  // 버튼은 브라우저 인쇄만 수행한다. 기록은 개인정보를 표시하는 화면 열람 시 남긴다.
  if (apps.length > 0) {
    await recordPrint(me.userId, await getClientIp(), roundId,
      JSON.stringify(apps.map((app) => app.empNo)));
  }

  return (
    <main className={styles.root}>
      <div className={styles.toolbar}>
        <h1 className="text-2xl font-bold">{round.name} — 심사 자료</h1>
        <p>확정된 신청서 {apps.length}건 · 신청자별로 페이지를 나누어 인쇄합니다.</p>
        <div className="flex gap-4">
          <Link href={`/hr/rounds/${roundId}/applications`} className="underline">신청 현황</Link>
          {apps.length > 0 && <PrintButton />}
        </div>
      </div>
      {apps.length === 0 && <p role="status">확정된 신청서가 없습니다. 인쇄할 심사 자료가 없으므로 인쇄하지 마세요. 신청서 확정 후 인쇄할 수 있습니다.</p>}
      {apps.map((app) => {
        const appItems = items.filter((item) => item.appId === app.appId);
        const value = (key: string) => appItems.find((item) => item.itemKey === key)?.currentValue ?? "-";
        return (
          <article key={app.appId} className={styles.sheet} aria-labelledby={`review-${app.appId}`}>
            <h2 id={`review-${app.appId}`} className={styles.title}>승진 심사 자료</h2>
            <p>{round.name} · 기준일 {round.baseDate}</p>
            <dl className={styles.identity}>
              <div><dt>사번</dt><dd>{app.empNo}</dd></div>
              <div><dt>성명</dt><dd>{value("name")}</dd></div>
              <div><dt>소속</dt><dd>{value("org")}</dd></div>
              <div><dt>신청 상태</dt><dd>확정</dd></div>
            </dl>
            <h3 className={styles.heading}>신청 항목</h3>
            <table className={styles.items}>
              <thead><tr><th scope="col">항목</th><th scope="col">현재 값</th></tr></thead>
              <tbody>{appItems.map((item) => (
                <tr key={item.itemKey}><th scope="row">{item.label}</th><td>{item.currentValue}</td></tr>
              ))}</tbody>
            </table>
            {appItems.length === 0 && <p>신청 항목이 없습니다.</p>}
            <h3 className={styles.heading}>주요 업무실적</h3>
            <p className={styles.prose}>{app.achievement || "입력된 업무실적이 없습니다."}</p>
            <h3 className={styles.heading}>자기개발 계획</h3>
            <p className={styles.prose}>{app.plan || "입력된 계획이 없습니다."}</p>
          </article>
        );
      })}
      <section className={`${styles.toolbar} ${styles.screenOnly}`}>
        <h2 className="text-xl font-semibold">CSV 다운로드</h2>
        <form method="post" action={`/hr/rounds/${roundId}/review-data/csv`} className="space-y-2">
          <label htmlFor="download-reason" className="block">다운로드 사유 (필수)</label>
          <textarea id="download-reason" name="reason" required rows={2} className="w-full rounded border p-2" />
          <button type="submit" className="rounded border px-4 py-2">CSV 다운로드</button>
        </form>
      </section>
    </main>
  );
}
