import { Button } from "@/components/ui/primitives";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui/workspace";
import Link from "next/link";
import { db } from "@/db/client";
import { stepSchedule } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { COMPARE_STATUS, GRADES } from "@/lib/codes";
import { recalcAction, bulkConfirmAction } from "./actions";

export default async function StepsPage({ searchParams }: PageProps<"/hr/steps">) {
  await requireRole("HR");
  const query = await searchParams;
  const rows = await db.select().from(stepSchedule).orderBy(stepSchedule.empNo);
  const filtered = rows.filter((r) => !query.status || r.compareStatus === query.status);
  return <main className="workspace-page">
    <PageHeader description="자동 산정값과 수기 대장을 비교하고 차기승급일을 확정합니다." className="text-2xl font-bold">차기승급일 관리</PageHeader>
    {typeof query.message === "string" && <p role="status">{query.message}</p>}
    <div className="flex gap-4"><form action={recalcAction}><Button className="rounded border px-4 py-2">재계산</Button></form><form action={bulkConfirmAction}><Button className="rounded border px-4 py-2">일치 건 일괄 확정</Button></form></div>
    <nav className="flex flex-wrap gap-4" aria-label="비교 상태 필터"><Link prefetch={false} href="/hr/steps">전체 {rows.length}명</Link>{Object.entries(COMPARE_STATUS).map(([code, label]) => <Link prefetch={false} key={code} href={`/hr/steps?status=${code}`} aria-current={query.status === code ? "page" : undefined}>{label} {rows.filter((r) => r.compareStatus === code).length}명</Link>)}</nav>
    <p>재확인 필요 {rows.filter((r) => r.reviewNeeded === "Y").length}명</p>
    <div className="overflow-x-auto"><DataTable className="w-full border-collapse text-left"><thead><tr>{["사번", "성명", "직급", "호봉", "현 호봉 승급일", "불산입 일수", "자동 산정값", "수기 대장 값", "비교 상태", "확정값", "확정 방식", "재확인 필요"].map((h) => <th scope="col" className="border p-2" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map((r) => <tr key={r.empNo}>{[<Link prefetch={false} key="link" href={`/hr/steps/${r.empNo}`}>{r.empNo}</Link>, r.name, GRADES.find((g) => g.code === r.grade)?.label, r.step, r.calcStatus === "EXCLUDED" ? "-" : r.stepDate, r.calcStatus === "OK" ? r.excludedDays : "-", r.autoNextDate ?? "-", r.manualDate ?? "-", <StatusBadge key="compare" status={r.compareStatus}/>, r.confirmedDate ?? "-", r.confirmSource ?? "-", r.reviewNeeded].map((v, i) => <td className="border p-2" key={i}>{v}</td>)}</tr>)}</tbody></DataTable></div>
    {!rows.length && <p>재계산을 실행해 차기승급일을 산정해 주세요.</p>}
    {!!rows.length && !filtered.length && <p>해당 비교 상태의 직원이 없습니다.</p>}
  </main>;
}
