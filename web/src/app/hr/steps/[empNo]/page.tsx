import Link from "next/link";
import { and, eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { stepSchedule, srcEmployee, processHistory } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { getClientIp, recordAccess } from "@/lib/access-log";
import { COMPARE_STATUS } from "@/lib/codes";
import type { StepCalc } from "@/domain/step";
import { confirmAction } from "../actions";

export default async function StepPage({ params, searchParams }: PageProps<"/hr/steps/[empNo]">) {
  const me = await requireRole("HR");
  const { empNo } = await params;
  const query = await searchParams;
  const [row] = await db.select().from(stepSchedule).where(eq(stepSchedule.empNo, empNo));
  const [employee] = await db.select().from(srcEmployee).where(eq(srcEmployee.empNo, empNo));
  if (!row || !employee) notFound();
  const calc: StepCalc = JSON.parse(row.calcDetailJson);
  const history = await db.select().from(processHistory).where(and(eq(processHistory.entityType, "STEP"), eq(processHistory.entityId, empNo))).orderBy(asc(processHistory.actedAt), asc(processHistory.histId));
  await recordAccess({ userId: me.userId, ip: await getClientIp(), subjectEmpNo: empNo, action: "VIEW", target: "SCR-08 차기승급일 상세" });
  return <main className="space-y-5 p-6"><Link href="/hr/steps">차기승급일 목록</Link><h1 className="text-2xl font-bold">{row.name} ({empNo}) 차기승급일</h1>
    {typeof query.error === "string" && <p role="alert">{query.error}</p>}{query.saved && <p role="status">확정했습니다.</p>}
    <p>휴대전화: {employee.phone}</p><p>현 호봉 승급일: {row.stepDate} / 자동 산정값: {row.autoNextDate ?? "-"} / 수기 대장 값: {row.manualDate ?? "-"}</p>
    <p>비교 상태: {COMPARE_STATUS[row.compareStatus as keyof typeof COMPARE_STATUS]} / 확정값: {row.confirmedDate ?? "-"} / 확정 방식: {row.confirmSource ?? "-"} / 재확인 필요: {row.reviewNeeded}</p>
    <section><h2 className="text-xl font-bold">계산 근거</h2><p>불산입 일수: {row.calcStatus === "OK" ? row.excludedDays : "-"}</p>
      {row.calcStatus === "UNDETERMINED" && <p>종료일 미정 불산입 휴직 등으로 산정할 수 없습니다.</p>}
      {row.calcStatus === "EXCLUDED" && <p>퇴직자는 관리 제외입니다.</p>}
      <ul>{calc.parts.map((p, i) => <li key={i}>{p.subType}: {p.start} ~ {p.end}, {p.days}일</li>)}</ul>
      {row.calcStatus === "OK" && !calc.parts.length && <p>불산입 기간이 없습니다.</p>}
      <h3>반복 계산 과정</h3><ol>{calc.iterations.map((v, i) => <li key={i}>{i + 1}회: 불산입 {v.excludedDays}일 → {v.nextDate}</li>)}</ol>
    </section>
    <section><h2 className="text-xl font-bold">차기승급일 확정</h2><form action={confirmAction} className="space-y-3"><input type="hidden" name="empNo" value={empNo}/><button name="source" value="AUTO" disabled={row.calcStatus !== "OK"} className="rounded border px-4 py-2 disabled:opacity-40">자동값으로 확정</button><div><label>직접 입력 날짜 <input type="date" name="date" className="border"/></label></div><div><label>직접 입력 사유 <textarea name="reason" className="border"/></label></div><button name="source" value="MANUAL" disabled={row.calcStatus === "EXCLUDED"} className="rounded border px-4 py-2 disabled:opacity-40">직접 입력으로 확정</button></form></section>
    <section><h2 className="text-xl font-bold">처리 이력</h2>{!history.length && <p>처리 이력이 없습니다.</p>}<ol>{history.map((h) => <li className="border-b py-2" key={h.histId}>{h.actedAt} / {h.actor} / {h.action} {h.reason} {h.detailJson}</li>)}</ol></section>
  </main>;
}
