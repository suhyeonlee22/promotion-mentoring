import { Button } from "@/components/ui/primitives";
import { PageHeader, Surface, DataTable, StatusBadge } from "@/components/ui/workspace";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  application,
  applicationItem,
  correctionRequest,
  promotionRound,
  processHistory,
  srcEmployee,
  srcOrg,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import { APP_STATUS, CORRECTION_STATUS } from "@/lib/codes";
import { getClientIp, recordAccess } from "@/lib/access-log";
import { statusLabel } from "@/lib/format";
import { returnApplicationAction, confirmApplicationAction, approveCorrectionAction, rejectCorrectionAction } from "./actions";

// React cache는 같은 서버 렌더 요청 안에서만 중복 호출을 합친다.
// 새로고침이나 다음 열람 요청은 별도의 VIEW로 남긴다.
const recordApplicationView = cache(async (
  userId: string, ip: string, appId: number, empNo: string,
) => {
  await recordAccess({
    userId, ip, subjectEmpNo: empNo, action: "VIEW",
    target: `SCR-05 신청서 검토 (신청서 #${appId})`,
  });
});

export default async function ApplicationsPage({
  params,
  searchParams,
}: PageProps<"/hr/applications/[appId]">) {
  const me = await requireRole("HR"); // 인사팀만 접근하도록 제한

  const { appId: rawId } = await params; // URL의 appId를 가져옴
  const appId = Number(rawId);
  const { error } = await searchParams; // URL의 error를 가져옴
  const errorMessage = typeof error === "string" ? error : null;

  if (!Number.isInteger(appId) || appId <= 0) {
    notFound();
  }

  const [app] = await db
    .select()
    .from(application)
    .where(eq(application.appId, appId));

  if (!app) notFound();

  const [round] = await db
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, app.roundId));
  if (!round) notFound();

  const [employee] = await db
    .select()
    .from(srcEmployee)
    .where(eq(srcEmployee.empNo, app.empNo));
  if (!employee) notFound();

  const items = await db
    .select()
    .from(applicationItem) // 신청서 세부 항목 조회
    .where(eq(applicationItem.appId, appId))
    .orderBy(asc(applicationItem.sortOrder));

  const [org] = await db.select().from(srcOrg).where(eq(srcOrg.orgId, employee.orgId));
  const requests = await db.select().from(correctionRequest)
    .where(eq(correctionRequest.appId, appId))
    .orderBy(desc(correctionRequest.reqId));
  const correctionStatus = (status: string) =>
    CORRECTION_STATUS[status as keyof typeof CORRECTION_STATUS] ?? status;

  const history = await db.select().from(processHistory).where(or(
    and(
      eq(processHistory.entityType, "APPLICATION"),
      eq(processHistory.entityId, String(appId)),
    ),
    requests.length > 0 ? and(
      eq(processHistory.entityType, "CORRECTION"),
      inArray(processHistory.entityId, requests.map((req) => String(req.reqId))),
    ) : undefined,
  )).orderBy(asc(processHistory.actedAt), asc(processHistory.histId));

  await recordApplicationView(me.userId, await getClientIp(), appId, app.empNo);

  return (
    <main className="workspace-page">
      <PageHeader description="원본과 현재 값을 비교하고 신청서 검토를 진행합니다." className="text-2xl font-bold">신청서 #{appId} — 검토</PageHeader>
      <p>회차명: {round.name}</p>
      {errorMessage && (
        <p className="text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
      <p>사번: {app.empNo}</p>
      <p>이름: {employee.name}</p>
      <p>소속: {org?.orgName ?? "조직 정보 없음"}</p>
      <p>신청서 상태: <StatusBadge status={app.status}>{APP_STATUS[app.status as keyof typeof APP_STATUS] ?? app.status}</StatusBadge></p>
      <Surface>
        <h2 className="mb-4 text-xl font-semibold">주요 데이터</h2>
        <div className="overflow-x-auto">
          <DataTable className="w-full border-collapse text-left">
            <thead><tr className="border-b">
              <th className="p-2" scope="col">항목명</th>
              <th className="p-2" scope="col">ERP 원본 값</th>
              <th className="p-2" scope="col">현재 값</th>
              <th className="p-2" scope="col">차이 여부</th>
              <th className="p-2" scope="col">정정 상태 (최신 요청)</th>
            </tr></thead>
            <tbody>{items.map((item) => {
              const changed = item.erpValue !== item.currentValue;
              const latest = requests.find((req) => req.itemKey === item.itemKey);
              return <tr key={item.itemKey} className="border-b">
                <th className="p-2" scope="row">{item.label}</th>
                <td className="whitespace-pre-wrap break-words p-2">{item.erpValue}</td>
                <td className={`whitespace-pre-wrap break-words p-2 ${changed ? "bg-amber-50 font-semibold text-amber-900" : ""}`}>{item.currentValue}</td>
                <td className="p-2">{changed ? "다름" : "동일"}</td>
                <td className="p-2">{latest ? correctionStatus(latest.status) : "요청 없음"}</td>
              </tr>;
            })}</tbody>
          </DataTable>
        </div>
      </Surface>
      <Surface>
        <h2 className="mb-4 text-xl font-semibold">정정 요청</h2>
        {requests.length === 0 ? <p>정정 요청이 없습니다.</p> : (
          <div className="overflow-x-auto">
            <DataTable className="w-full border-collapse text-left">
              <thead><tr className="border-b">
                <th className="p-2" scope="col">항목</th>
                <th className="p-2" scope="col">요청 값</th>
                <th className="p-2" scope="col">사유</th>
                <th className="p-2" scope="col">상태</th>
                <th className="p-2" scope="col">처리</th>
              </tr></thead>
              <tbody>{requests.map((req) => (
                <tr key={req.reqId} className="border-b align-top">
                  <th className="p-2" scope="row">{items.find((item) => item.itemKey === req.itemKey)?.label ?? req.itemKey}</th>
                  <td className="whitespace-pre-wrap break-words p-2">{req.requestedValue}</td>
                  <td className="whitespace-pre-wrap break-words p-2">{req.reason}</td>
                  <td className="p-2">{correctionStatus(req.status)}</td>
                  <td className="p-2">
                    {req.status === "PENDING" ? (
                      <div className="space-y-4">
                        <form action={approveCorrectionAction} className="space-y-2">
                          <input type="hidden" name="appId" value={appId} />
                          <input type="hidden" name="reqId" value={req.reqId} />
                          <label className="block" htmlFor={`applied-${req.reqId}`}>승인 반영 값</label>
                          <input id={`applied-${req.reqId}`} name="appliedValue" defaultValue={req.requestedValue} required className="w-full rounded border p-2" />
                          <Button type="submit" className="rounded border px-4 py-2">승인</Button>
                        </form>
                        <form action={rejectCorrectionAction} className="space-y-2">
                          <input type="hidden" name="appId" value={appId} />
                          <input type="hidden" name="reqId" value={req.reqId} />
                          <label className="block" htmlFor={`feedback-${req.reqId}`}>반려 피드백</label>
                          <textarea id={`feedback-${req.reqId}`} name="feedback" required className="w-full rounded border p-2" />
                          <Button type="submit" className="rounded border px-4 py-2">반려</Button>
                        </form>
                      </div>
                    ) : req.status === "APPROVED" ? (
                      <p className="whitespace-pre-wrap break-words">반영 값: {req.appliedValue ?? "-"}</p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">피드백: {req.feedback ?? "-"}</p>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </DataTable>
          </div>
        )}
      </Surface>
      <Surface className="space-y-4">
        <h2 className="text-xl font-semibold">직원 입력</h2>
        <h3 className="font-semibold">주요 업무실적</h3>
        <p className="whitespace-pre-wrap break-words">{app.achievement || "입력된 업무실적이 없습니다."}</p>
        <h3 className="font-semibold">자기개발 계획</h3>
        <p className="whitespace-pre-wrap break-words">{app.plan || "입력된 계획이 없습니다."}</p>
      </Surface>
      <Surface>
        {app.status === "SUBMITTED" && (
          <>
            <form action={returnApplicationAction}>
              <input type="hidden" name="appId" value={appId} />
              <label htmlFor="return-reason">보완 요청 사유</label>
              <textarea id="return-reason" name="reason" required />
              <Button type="submit">보완 요청</Button>
            </form>
            <form action={confirmApplicationAction}>
              <input type="hidden" name="appId" value={appId} />
              <Button type="submit">확정</Button>
            </form>
          </>
        )}
      </Surface>
      <Surface>
        <h2 className="mb-4 text-xl font-semibold">처리 이력 (시간순)</h2>
        {history.length === 0 ? <p>처리 이력이 없습니다.</p> : (
          <div className="overflow-x-auto">
            <DataTable className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-2">처리 시각</th>
                  <th scope="col" className="p-2">대상</th>
                  <th scope="col" className="p-2">처리 코드</th>
                  <th scope="col" className="p-2">이전 상태</th>
                  <th scope="col" className="p-2">이후 상태</th>
                  <th scope="col" className="p-2">처리자</th>
                  <th scope="col" className="p-2">사유</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const req = requests.find((r) => String(r.reqId) === entry.entityId);
                  const item = entry.entityType === "CORRECTION"
                    ? items.find((i) => i.itemKey === req?.itemKey) : undefined;
                  const statuses = entry.entityType === "APPLICATION" ? APP_STATUS : CORRECTION_STATUS;
                  return (
                    <tr key={entry.histId} className="border-b align-top">
                      <td className="p-2"><time dateTime={entry.actedAt}>{entry.actedAt}</time></td>
                      <td className="p-2">{entry.entityType === "APPLICATION" ? `신청서 #${appId}` : `정정 요청 #${entry.entityId} (${item?.label ?? req?.itemKey ?? "-"})`}</td>
                      <td className="p-2">{entry.action}</td>
                      <td className="p-2">{statusLabel(statuses, entry.fromStatus)}</td>
                      <td className="p-2">{statusLabel(statuses, entry.toStatus)}</td>
                      <td className="p-2">{entry.actor}</td>
                      <td className="whitespace-pre-wrap break-words p-2">{entry.reason ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </Surface>
    </main>
  );
}
