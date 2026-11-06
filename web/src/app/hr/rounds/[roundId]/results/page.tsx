import { Button } from "@/components/ui/primitives";
import { PageHeader, DataTable } from "@/components/ui/workspace";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { application, applicationItem, promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { ROUND_STATUS } from "@/lib/codes";
import { notifyResultsAction, registerResultAction } from "./actions";

export default async function ResultsPage({ params, searchParams }: PageProps<"/hr/rounds/[roundId]/results">) {
  await requireRole("HR");
  const roundId = Number((await params).roundId);
  if (!Number.isSafeInteger(roundId) || roundId <= 0) notFound();
  const [round] = await db.select().from(promotionRound).where(eq(promotionRound.roundId, roundId));
  if (!round) notFound();
  const apps = await db.select({ app: application, name: applicationItem.currentValue })
    .from(application).leftJoin(applicationItem, and(
      eq(applicationItem.appId, application.appId), eq(applicationItem.itemKey, "name"),
    )).where(and(eq(application.roundId, roundId), eq(application.status, "CONFIRMED")))
    .orderBy(asc(application.empNo));
  const { error, saved, sent } = await searchParams;
  const editable = round.status === "RESULT";
  return (
    <main className="workspace-page">
      <PageHeader description="확정 신청서의 심사 결과를 등록하고 결과 안내를 발송합니다." className="text-2xl font-bold">{round.name} — 결과 등록·안내</PageHeader>
      <p>회차 상태: {ROUND_STATUS[round.status as keyof typeof ROUND_STATUS] ?? round.status}</p>
      <nav className="flex gap-4">
        <Link prefetch={false} href="/hr/rounds" className="underline">회차 목록</Link>
        <Link prefetch={false} href="/hr/mails" className="underline">메일 발송함</Link>
      </nav>
      {typeof error === "string" && <p role="alert" className="text-red-600">{error}</p>}
      {saved === "1" && <p role="status">결과를 저장했습니다.</p>}
      {typeof sent === "string" && /^\d+$/.test(sent) && <p role="status">새 결과 안내 메일: {sent}건</p>}
      {!editable && <p>결과 등록·안내는 회차가 결과 상태일 때 가능합니다.</p>}
      {apps.length === 0 ? <p>확정된 신청서가 없습니다.</p> : (
        <div className="overflow-x-auto">
          <DataTable className="w-full border-collapse text-left">
            <thead><tr className="border-b">
              <th scope="col" className="p-2">사번</th><th scope="col" className="p-2">성명</th>
              <th scope="col" className="p-2">결과</th><th scope="col" className="p-2">안내 상태</th>
              <th scope="col" className="p-2">결과 등록·변경</th>
            </tr></thead>
            <tbody>{apps.map(({ app, name }) => (
              <tr key={app.appId} className="border-b">
                <td className="p-2">{app.empNo}</td><td className="p-2">{name ?? "-"}</td>
                <td className="p-2">{app.result === "PROMOTED" ? "승진" : app.result === "NOT_PROMOTED" ? "미승진" : "미등록"}</td>
                <td className="p-2">{app.resultNotifiedAt ? `안내 완료 (${app.resultNotifiedAt})` : "안내 전"}</td>
                <td className="p-2">{editable && (
                  <form action={registerResultAction} className="flex gap-2">
                    <input type="hidden" name="roundId" value={roundId} />
                    <input type="hidden" name="appId" value={app.appId} />
                    <label htmlFor={`result-${app.appId}`} className="sr-only">{name ?? app.empNo} 결과</label>
                    <select id={`result-${app.appId}`} name="result" defaultValue={app.result ?? ""} required className="rounded border p-2">
                      <option value="" disabled>선택</option><option value="PROMOTED">승진</option><option value="NOT_PROMOTED">미승진</option>
                    </select>
                    <Button type="submit" className="rounded border px-4 py-2">저장</Button>
                  </form>
                )}</td>
              </tr>
            ))}</tbody>
          </DataTable>
        </div>
      )}
      {editable && apps.length > 0 && (
        <form action={notifyResultsAction}>
          <input type="hidden" name="roundId" value={roundId} />
          <Button variant="primary" type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">결과 안내 발송</Button>
          <p className="mt-2">결과가 등록된 직원에게 안내합니다. 이미 쌓인 메일은 중복 생성하지 않습니다.</p>
        </form>
      )}
    </main>
  );
}
