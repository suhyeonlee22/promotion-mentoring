import Link from "next/link";
import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { srcAppointment, srcEmployee, srcManualStepLedger } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { DISCIPLINE_TYPES, GRADES, LEAVE_TYPES } from "@/lib/codes";
import { queryText } from "@/lib/log-filters";
import { editMockErpAction } from "./actions";

type Employee = { empNo: string; name: string };
function AppointmentFields({ row, employees }: { row?: typeof srcAppointment.$inferSelect; employees: Employee[] }) {
  return <div className="grid gap-3 md:grid-cols-3">
    <label>발령 ID <input name="apptId" required readOnly={!!row} defaultValue={row?.apptId} className="w-full border p-2"/></label>
    <label>직원 <select name="empNo" defaultValue={row?.empNo} className="w-full border p-2">{employees.map((e) => <option key={e.empNo} value={e.empNo}>{e.empNo} {e.name}</option>)}</select></label>
    <label>발령 유형 <select name="apptType" defaultValue={row?.apptType ?? "LEAVE"} className="w-full border p-2">{Object.entries({ HIRE: "임용", PROMOTE: "승진", STEP_UP: "승급", LEAVE: "휴직", DISCIPLINE: "징계" }).map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}</select></label>
    <label>세부 유형 <select name="subType" defaultValue={row ? row.subType ?? "" : "SICK"} className="w-full border p-2"><option value="">없음 (임용·승진·승급)</option>{Object.entries({ ...LEAVE_TYPES, ...DISCIPLINE_TYPES }).map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}</select></label>
    <label>시작일 <input type="date" name="startDate" required defaultValue={row?.startDate} className="w-full border p-2"/></label>
    <label>종료일 (복직일 미정이면 비움) <input type="date" name="endDate" defaultValue={row?.endDate ?? ""} className="w-full border p-2"/></label>
    <label>발령 후 호봉 (승급 시 필수) <input type="number" min="1" step="1" name="stepAfter" defaultValue={row?.stepAfter ?? ""} className="w-full border p-2"/></label>
    <label>발령 후 직급 (임용·승진 시 필수) <select name="gradeAfter" defaultValue={row?.gradeAfter ?? ""} className="w-full border p-2"><option value="">없음</option>{GRADES.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}</select></label>
    <label>메모 <textarea name="memo" defaultValue={row?.memo ?? ""} className="w-full border p-2"/></label>
  </div>;
}

export default async function MockErpPage({ searchParams }: PageProps<"/hr/mock-erp">) {
  await requireRole("HR");
  const query = await searchParams;
  const table = queryText(query, "table") || "src_appointment";
  if (!["src_appointment", "src_manual_step_ledger"].includes(table)) notFound();
  const employees = await db.select({ empNo: srcEmployee.empNo, name: srcEmployee.name }).from(srcEmployee).orderBy(srcEmployee.empNo);
  const appointments = table === "src_appointment" ? await db.select().from(srcAppointment).orderBy(desc(srcAppointment.startDate), srcAppointment.apptId) : [];
  const ledger = table === "src_manual_step_ledger" ? await db.select().from(srcManualStepLedger).orderBy(srcManualStepLedger.empNo) : [];
  const error = queryText(query, "error");
  return <main className="space-y-6 p-6"><h1 className="text-2xl font-bold">Mock ERP 편집 (실습용)</h1>
    <p>ERP 자체 수정은 처리 이력을 만들지 않습니다. 변경 후 <Link className="underline" href="/hr/steps">차기승급일 관리에서 재계산</Link>하여 변경 감지를 확인하세요.</p>
    <nav className="flex gap-4"><Link href="/hr/mock-erp?table=src_appointment">발령 이력 (src_appointment)</Link><Link href="/hr/mock-erp?table=src_manual_step_ledger">수기 승급 대장 (src_manual_step_ledger)</Link></nav>
    {error && <p role="alert">{error}</p>}{query.saved === "1" && <p role="status">저장했습니다. 필요한 경우 재계산을 실행해 주세요.</p>}
    {table === "src_appointment" ? <>
      <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">발령 추가</h2><form action={editMockErpAction} className="space-y-3"><AppointmentFields employees={employees}/><button name="operation" value="ADD" className="rounded border px-4 py-2">추가</button></form></section>
      <section><h2 className="text-xl font-semibold">발령 목록 · {appointments.length}건</h2>{appointments.map((a) => <details key={a.apptId} className="my-3 rounded border p-4"><summary className="cursor-pointer">{a.apptId} / {a.empNo} {employees.find((e) => e.empNo === a.empNo)?.name} / {a.apptType} {a.subType} / {a.startDate} ~ {a.endDate ?? "-"}</summary>
        <form action={editMockErpAction} className="my-3 space-y-3"><AppointmentFields row={a} employees={employees}/><button name="operation" value="UPDATE" className="rounded border px-4 py-2">수정 저장</button></form>
        <form action={editMockErpAction}><input type="hidden" name="apptId" value={a.apptId}/><button name="operation" value="DELETE" className="rounded border px-4 py-2">발령 삭제</button></form>
      </details>)}</section>
    </> : <section><h2 className="text-xl font-semibold">수기 대장 목록 · {ledger.length}건</h2>{ledger.map((l) => <form action={editMockErpAction} key={l.empNo} className="my-3 flex flex-wrap items-end gap-3 rounded border p-4"><p>{l.empNo} {employees.find((e) => e.empNo === l.empNo)?.name}</p><input type="hidden" name="empNo" value={l.empNo}/><label>차기승급일 <input type="date" name="nextStepDate" defaultValue={l.nextStepDate ?? ""} className="border p-2"/></label><label>메모 <textarea name="memo" defaultValue={l.memo ?? ""} className="border p-2"/></label><button name="operation" value="LEDGER" className="rounded border px-4 py-2">대장 수정</button></form>)}</section>}
  </main>;
}
