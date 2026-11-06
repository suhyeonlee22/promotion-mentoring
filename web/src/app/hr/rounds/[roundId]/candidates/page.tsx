import { Button } from "@/components/ui/primitives";
import { PageHeader, DataTable, Surface } from "@/components/ui/workspace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  promotionRound,
  promotionCandidate,
  processHistory,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import { ROUND_STATUS, DISCIPLINE_TYPES, LEAVE_TYPES } from "@/lib/codes";
import { recordAccess, getClientIp } from "@/lib/access-log";
import type { SelectionEvidence } from "@/services/rounds";
import { manualAction, selectionAction } from "../../actions";

const gradeName = (grade: string) => `${grade.slice(1)}급`;
const typeNames: Record<string, string> = {
  ...DISCIPLINE_TYPES,
  ...LEAVE_TYPES,
};

export default async function CandidatesPage({
  params,
  searchParams,
}: PageProps<"/hr/rounds/[roundId]/candidates">) {
  const me = await requireRole("HR");
  const roundId = Number((await params).roundId);
  if (!Number.isSafeInteger(roundId) || roundId <= 0) notFound();
  const { error, empNo } = await searchParams;
  const [round] = await db
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, roundId));
  if (!round) notFound();
  const candidates = await db
    .select()
    .from(promotionCandidate)
    .where(eq(promotionCandidate.roundId, roundId))
    .orderBy(promotionCandidate.empNo);
  const [history] = await db
    .select()
    .from(processHistory)
    .where(
      and(
        eq(processHistory.entityType, "ROUND"),
        eq(processHistory.entityId, String(roundId)),
        eq(processHistory.action, "SELECTION_RUN"),
      ),
    )
    .orderBy(desc(processHistory.histId))
    .limit(1);
  const evidence: SelectionEvidence = history?.detailJson
    ? (JSON.parse(history.detailJson).evidence ?? {})
    : {};
  const selected = candidates.find((c) => c.empNo === empNo);
  if (selected)
    await recordAccess({
      userId: me.userId,
      ip: await getClientIp(),
      subjectEmpNo: selected.empNo,
      action: "VIEW",
      target: "SCR-03 대상자 판정 근거",
    });
  const detail = selected ? evidence[selected.empNo] : undefined;
  const preparing = round.status === "PREPARING";
  return (
    <main className="workspace-page">
      <Link prefetch={false} href="/hr/rounds" className="text-blue-700 underline">
        회차 목록
      </Link>
      <PageHeader description="선정 결과와 판정 근거를 확인하고 예외 대상을 관리합니다." className="text-2xl font-bold">{round.name} — 대상자 선정</PageHeader>
      <p>
        기준일 {round.baseDate} · 상태{" "}
        {ROUND_STATUS[round.status as keyof typeof ROUND_STATUS]}
      </p>
      {typeof error === "string" && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p>
        판정 대상 {candidates.length} / 자동 선정{" "}
        {candidates.filter((c) => c.autoSelected === "Y").length} / 최종 대상{" "}
        {candidates.filter((c) => c.finalSelected === "Y").length}
      </p>
      {preparing && (
        <form action={selectionAction}>
          <input type="hidden" name="roundId" value={roundId} />
          <Button variant="primary" className="rounded bg-blue-700 px-4 py-2 text-white">
            선정 실행
          </Button>
        </form>
      )}
      <div className="overflow-x-auto">
        <DataTable className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">대상자 판정 결과</caption>
          <thead>
            <tr>
              {[
                "사번",
                "성명 (판정 근거)",
                "소속",
                "현 → 예정",
                "현 직급 임용일",
                "소요 개월",
                "불산입 일수",
                "소요기간 충족일",
                "R1",
                "R2",
                "R3",
                "승진 제한 종료일",
                "자동 선정",
                "예외 처리·사유",
                "최종 대상",
                "예외 처리",
              ].map((label) => (
                <th scope="col" className="whitespace-nowrap border p-2" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.empNo}
                className={
                  c.finalSelected === "Y" ? "bg-blue-50 text-slate-900" : ""
                }
              >
                <td className="border p-2">{c.empNo}</td>
                <td className="border p-2">
                  <Link prefetch={false}
                    className="text-blue-700 underline"
                    href={`?empNo=${c.empNo}#evidence`}
                  >
                    {c.name}
                  </Link>
                </td>
                {[
                  c.orgName,
                  `${gradeName(c.grade)} → ${gradeName(c.targetGrade)}`,
                  c.gradeDate,
                  c.requiredMonths,
                  c.excludedDays,
                  c.qualifyDate,
                  c.r1Active,
                  c.r2Period,
                  c.r3Discipline,
                  c.restrictEndDate ?? "-",
                  c.autoSelected === "Y" ? "선정" : "미선정",
                  `${({ NONE: "없음", ADD: "추가", EXCLUDE: "제외" } as Record<string, string>)[c.manualAction]} / ${c.manualReason ?? "-"}`,
                  c.finalSelected === "Y" ? "Y" : "N",
                ].map((value, i) => (
                  <td key={i} className="border p-2">
                    {value}
                  </td>
                ))}
                <td className="min-w-64 border p-2">
                  {preparing && (
                    <form
                      action={manualAction}
                      className="flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="roundId" value={roundId} />
                      <input type="hidden" name="empNo" value={c.empNo} />
                      <label>
                        사유{" "}
                        <input
                          className="w-44 border p-1"
                          name="reason"
                          defaultValue={c.manualReason ?? ""}
                        />
                      </label>
                      <Button
                        className="rounded border p-1"
                        name="action"
                        value={c.autoSelected === "Y" ? "EXCLUDE" : "ADD"}
                      >
                        {c.autoSelected === "Y" ? "수동 제외" : "수동 추가"}
                      </Button>
                      {c.manualAction !== "NONE" && (
                        <Button
                          className="rounded border p-1"
                          name="action"
                          value="NONE"
                        >
                          취소
                        </Button>
                      )}
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      {!candidates.length && (
        <p>선정 실행 후 대상자와 판정 근거를 확인할 수 있습니다.</p>
      )}
      {selected && (
        <Surface id="evidence" className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-bold">{selected.name} 판정 근거</h2>
          <p>
            선정 시각: {selected.judgedAt}. R1 재직·근무 / R2 소요기간 / R3 징계
            제한
          </p>
          <p>
            현 직급 임용일 {selected.gradeDate} + {selected.requiredMonths}개월
            + 불산입 {selected.excludedDays}일 → {selected.qualifyDate}
          </p>
          <h3 className="font-bold">불산입 기간</h3>
          {detail?.judgement.excludedParts.length ? (
            <ul>
              {detail.judgement.excludedParts.map((p, i) => (
                <li key={i}>
                  {typeNames[p.subType] ?? p.subType}: {p.start} ~ {p.end} (
                  {p.days}일)
                </li>
              ))}
            </ul>
          ) : (
            <p>없음</p>
          )}
          <h3 className="font-bold">징계 이력</h3>
          {detail?.disciplines.length ? (
            <ul>
              {detail.disciplines.map((a, i) => (
                <li key={i}>
                  {typeNames[a.subType ?? ""] ?? a.subType}: {a.startDate} ~{" "}
                  {a.endDate ?? "-"}
                </li>
              ))}
            </ul>
          ) : (
            <p>없음</p>
          )}
          <p>승진 제한 종료일: {selected.restrictEndDate ?? "-"}</p>
        </Surface>
      )}
    </main>
  );
}
