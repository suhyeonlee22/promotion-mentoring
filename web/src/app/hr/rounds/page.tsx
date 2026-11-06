import { Button } from "@/components/ui/primitives";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui/workspace";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { ROUND_STATUS } from "@/lib/codes";
import { createRoundAction, statusAction } from "./actions";

export default async function HrRoundsPage({
  searchParams,
}: PageProps<"/hr/rounds">) {
  await requireRole("HR");
  const { error } = await searchParams;
  const rounds = await db
    .select()
    .from(promotionRound)
    .orderBy(desc(promotionRound.roundId));
  const next = {
    PREPARING: "APPLYING",
    APPLYING: "REVIEWING",
    REVIEWING: "RESULT",
  } as const;
  return (
    <main className="workspace-page">
      <PageHeader description="회차를 생성하고 승진 업무의 진행 상태를 관리합니다." className="text-2xl font-bold">승진 회차 관리</PageHeader>
      {typeof error === "string" && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <form
        action={createRoundAction}
        className="flex flex-wrap items-end gap-4 rounded border p-4"
      >
        <label>
          회차명 <input name="name" required className="border p-2" />
        </label>
        <label>
          기준일{" "}
          <input name="baseDate" type="date" required className="border p-2" />
        </label>
        <label>
          신청 시작일{" "}
          <input
            name="applyStart"
            type="date"
            required
            className="border p-2"
          />
        </label>
        <label>
          신청 종료일{" "}
          <input name="applyEnd" type="date" required className="border p-2" />
        </label>
        <Button variant="primary" className="rounded bg-blue-700 px-4 py-2 text-white">
          회차 생성
        </Button>
      </form>
      <DataTable className="w-full border-collapse text-left">
        <caption className="sr-only">승진 회차 목록</caption>
        <thead>
          <tr>
            {["회차명", "기준일", "신청 기간", "상태", "상태 전환"].map(
              (label) => (
                <th scope="col" key={label} className="border p-2">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const to = next[r.status as keyof typeof next];
            return (
              <tr key={r.roundId}>
                <td className="border p-2">
                  <Link prefetch={false}
                    className="text-blue-700 underline"
                    href={`/hr/rounds/${r.roundId}/candidates`}
                  >
                    {r.name}
                  </Link>
                  {r.status === "RESULT" && (
                    <Link prefetch={false} className="ml-3 text-blue-700 underline" href={`/hr/rounds/${r.roundId}/results`}>
                      결과 등록·안내
                    </Link>
                  )}
                </td>
                <td className="border p-2">{r.baseDate}</td>
                <td className="border p-2">
                  {r.applyStart} ~ {r.applyEnd}
                </td>
                <td className="border p-2">
                  <StatusBadge status={r.status}>{ROUND_STATUS[r.status as keyof typeof ROUND_STATUS]}</StatusBadge>
                </td>
                <td className="border p-2">
                  {to && (
                    <form action={statusAction}>
                      <input type="hidden" name="roundId" value={r.roundId} />
                      <input type="hidden" name="to" value={to} />
                      <Button className="rounded border px-3 py-1">
                        {ROUND_STATUS[to]}으로 전환
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {!rounds.length && <p>등록된 회차가 없습니다.</p>}
    </main>
  );
}
