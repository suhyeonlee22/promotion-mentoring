import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  application,
  applicationItem,
  correctionRequest,
  promotionRound,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import { requestCorrectionAction } from "./actions";
import ApplicationForm from "./application-form";

export default async function MyPromotionPage() {
  // 1. 직원 권한 확인
  const me = await requireRole("EMPLOYEE");

  if (!me.empNo) {
    return <p>직원 정보가 없습니다.</p>;
  }

  // 2. 본인의 가장 최근 신청서 조회
  const [app] = await db
    .select()
    .from(application)
    .where(eq(application.empNo, me.empNo))
    .orderBy(desc(application.roundId))
    .limit(1);

  if (!app) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">내 승진 신청서</h1>
        <p className="mt-4">현재 작성할 신청서가 없습니다.</p>
      </main>
    );
  }

  // 3. 회차 정보 조회
  const [round] = await db
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, app.roundId));

  // 4. 주요 데이터 조회
  const items = await db
    .select()
    .from(applicationItem)
    .where(eq(applicationItem.appId, app.appId))
    .orderBy(applicationItem.sortOrder);

  // 5. 정정 요청 내역 조회
  const corrections = await db
    .select()
    .from(correctionRequest)
    .where(eq(correctionRequest.appId, app.appId));

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">내 승진 신청서</h1>

      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold">신청 정보</h2>

        <p>회차: {round?.name ?? "-"}</p>
        <p>신청 상태: {app.status}</p>

        {app.resultNotifiedAt && (app.result === "PROMOTED" || app.result === "NOT_PROMOTED") && (
          <p>심사 결과: <strong>{app.result === "PROMOTED" ? "승진" : "미승진"}</strong></p>
        )}

        {app.returnReason && (
          <p className="text-red-600">보완 요청: {app.returnReason}</p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">주요 데이터</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">항목</th>
                <th className="p-2">현재 값</th>
                <th className="p-2">정정 가능</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const editable =
                  app.status === "RETURNED" ||
                  (round?.status === "APPLYING" &&
                    ["NOT_STARTED", "DRAFT"].includes(app.status));

                const hasPending = corrections.some(
                  (req) =>
                    req.itemKey === item.itemKey && req.status === "PENDING",
                );

                return (
                  <tr key={item.itemKey} className="border-b">
                    <td className="p-2">{item.label}</td>

                    <td className="p-2">{item.currentValue}</td>

                    <td className="p-2">
                      {item.correctable !== "Y" ? (
                        "불가"
                      ) : hasPending ? (
                        "처리 대기 중"
                      ) : !editable ? (
                        "현재 요청 불가"
                      ) : (
                        <form
                          action={requestCorrectionAction}
                          className="space-y-2"
                        >
                          <input type="hidden" name="appId" value={app.appId} />

                          <input
                            type="hidden"
                            name="itemKey"
                            value={item.itemKey}
                          />

                          <input
                            name="requestedValue"
                            required
                            placeholder="정정할 값"
                            className="w-full rounded border p-2"
                          />

                          <input
                            name="reason"
                            required
                            placeholder="정정 사유"
                            className="w-full rounded border p-2"
                          />

                          <button
                            type="submit"
                            className="rounded bg-blue-600 px-3 py-2 text-white"
                          >
                            정정 요청
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">정정 요청 내역</h2>

        {corrections.length === 0 ? (
          <p>정정 요청 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {corrections.map((req) => (
              <div key={req.reqId} className="rounded border p-3">
                <p>항목: {req.itemKey}</p>
                <p>요청 값: {req.requestedValue}</p>
                <p>사유: {req.reason}</p>
                <p>상태: {req.status}</p>
                {req.feedback && <p>처리 의견: {req.feedback}</p>}
                {req.appliedValue && <p>반영 값: {req.appliedValue}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 직원 작성 항목 */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">신청서 작성</h2>

        {["NOT_STARTED", "DRAFT", "RETURNED"].includes(app.status) && (
          <ApplicationForm key={app.appId} appId={app.appId} initialState={{
            error: "", achievement: app.achievement ?? "", plan: app.plan ?? "",
          }}/>
        )}

        {["SUBMITTED", "CONFIRMED"].includes(app.status) && (
          <div className="space-y-3">
            <p>주요 업무실적: {app.achievement}</p>
            <p>자기개발 계획: {app.plan}</p>
            <p>제출된 신청서는 수정할 수 없습니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}
