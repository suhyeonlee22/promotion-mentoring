import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  application,
  applicationItem,
  correctionRequest,
  promotionRound,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import { approveCorrectionAction, rejectCorrectionAction } from "./actions";

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  await requireRole("HR"); // 인사팀만 접근하도록 제한

  const { roundId: rawId } = await params; // URL의 roundId를 가져옴
  const roundId = Number(rawId);

  if (!Number.isInteger(roundId) || roundId <= 0) {
    notFound();
  }

  const [round] = await db
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, roundId));

  if (!round) notFound();

  const apps = await db
    .select()
    .from(application)
    .where(eq(application.roundId, roundId));

  const appIds = apps.map((app) => app.appId);

  const requests =
    appIds.length === 0
      ? []
      : await db
          .select()
          .from(correctionRequest) // 직원이 제출한 정정 요청 조회
          .where(inArray(correctionRequest.appId, appIds));

  const pending = requests.filter((req) => req.status === "PENDING");

  const items =
    appIds.length === 0
      ? []
      : await db
          .select()
          .from(applicationItem) // 정정 대상 항목의 현재 값 조회
          .where(inArray(applicationItem.appId, appIds));

  const counts = {
    NOT_STARTED: 0,
    DRAFT: 0,
    SUBMITTED: 0,
    RETURNED: 0,
    CONFIRMED: 0,
  };

  for (const app of apps) {
    if (app.status in counts) {
      counts[app.status as keyof typeof counts]++;
    }
  }

  return (
    <main className="space-y-8 p-6">
      <h1 className="text-2xl font-bold">{round.name} — 신청 현황</h1>

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-xl font-semibold">신청 상태별 인원</h2>

        <div className="flex flex-wrap gap-4">
          <p>작성 전: {counts.NOT_STARTED}명</p>
          <p>임시저장: {counts.DRAFT}명</p>
          <p>제출: {counts.SUBMITTED}명</p>
          <p>보완 요청: {counts.RETURNED}명</p>
          <p>확정: {counts.CONFIRMED}명</p>
        </div>

        <p className="mt-4 font-semibold">
          처리 대기 정정 요청: {pending.length}건
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-xl font-semibold">신청서 목록</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="p-2">사번</th>
                <th className="p-2">신청서 번호</th>
                <th className="p-2">상태</th><th className="p-2">제출일</th>
                <th className="p-2">정정 대기</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.appId} className="border-b">
                  <td className="p-2">{app.empNo}</td>
                  <td className="p-2">{app.appId}</td>
                  <td className="p-2">{app.status}</td><td className="p-2">{app.submittedAt ? <time dateTime={app.submittedAt}>{app.submittedAt}</time> : "미제출"}</td>
                  <td className="p-2">
                    {pending.filter((req) => req.appId === app.appId).length}건
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-xl font-semibold">처리 대기 정정 요청</h2>

        {pending.length === 0 ? (
          <p>처리 대기 중인 정정 요청이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((req) => {
              const app = apps.find((a) => a.appId === req.appId);

              const item = items.find(
                (i) => i.appId === req.appId && i.itemKey === req.itemKey,
              );

              return (
                <div key={req.reqId} className="rounded border p-4">
                  <p>요청 번호: {req.reqId}</p>
                  <p>직원: {app?.empNo ?? "-"}</p>
                  <p>항목: {item?.label ?? req.itemKey}</p>
                  <p>현재 값: {item?.currentValue ?? "-"}</p>
                  <p>요청 값: {req.requestedValue}</p>
                  <p>사유: {req.reason}</p>
                  <p>상태: {req.status}</p>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {/* 승인 */}
                    <form
                      action={approveCorrectionAction}
                      className="space-y-2 rounded border p-3"
                    >
                      <input type="hidden" name="roundId" value={roundId} />
                      <input type="hidden" name="reqId" value={req.reqId} />

                      <label className="block font-medium">승인할 값</label>
                      <input
                        name="appliedValue"
                        defaultValue={req.requestedValue}
                        required
                        className="w-full rounded border p-2"
                      />

                      <button
                        type="submit"
                        className="rounded bg-blue-600 px-4 py-2 text-white"
                      >
                        승인
                      </button>
                    </form>

                    {/* 반려 */}
                    <form
                      action={rejectCorrectionAction}
                      className="space-y-2 rounded border p-3"
                    >
                      <input type="hidden" name="roundId" value={roundId} />
                      <input type="hidden" name="reqId" value={req.reqId} />

                      <label className="block font-medium">반려 사유</label>
                      <textarea
                        name="feedback"
                        required
                        rows={2}
                        placeholder="반려 사유를 입력하세요."
                        className="w-full rounded border p-2"
                      />

                      <button
                        type="submit"
                        className="rounded border px-4 py-2"
                      >
                        반려
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
