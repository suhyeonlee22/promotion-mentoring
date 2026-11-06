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
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">승진 회차 관리</h1>
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
        <button className="rounded bg-blue-700 px-4 py-2 text-white">
          회차 생성
        </button>
      </form>
      <table className="w-full border-collapse text-left">
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
                  <Link
                    className="text-blue-700 underline"
                    href={`/hr/rounds/${r.roundId}/candidates`}
                  >
                    {r.name}
                  </Link>
                  {r.status === "RESULT" && (
                    <Link className="ml-3 text-blue-700 underline" href={`/hr/rounds/${r.roundId}/results`}>
                      결과 등록·안내
                    </Link>
                  )}
                </td>
                <td className="border p-2">{r.baseDate}</td>
                <td className="border p-2">
                  {r.applyStart} ~ {r.applyEnd}
                </td>
                <td className="border p-2">
                  {ROUND_STATUS[r.status as keyof typeof ROUND_STATUS]}
                </td>
                <td className="border p-2">
                  {to && (
                    <form action={statusAction}>
                      <input type="hidden" name="roundId" value={r.roundId} />
                      <input type="hidden" name="to" value={to} />
                      <button className="rounded border px-3 py-1">
                        {ROUND_STATUS[to]}으로 전환
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rounds.length && <p>등록된 회차가 없습니다.</p>}
    </main>
  );
}
