"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import { recalcAll, bulkConfirmMatched, confirmStep } from "@/services/steps";

export async function recalcAction() {
  const me = await requireRole("HR");
  const result = await recalcAll(me);
  revalidatePath("/hr/steps", "layout");
  redirect(`/hr/steps?message=${encodeURIComponent(`재계산 완료: 변경 ${result.changed}명, 재확인 ${result.reviewNeeded}명`)}`);
}
export async function bulkConfirmAction() {
  const me = await requireRole("HR");
  const count = await bulkConfirmMatched(me);
  revalidatePath("/hr/steps", "layout");
  redirect(`/hr/steps?message=${encodeURIComponent(`${count}명 일괄 확정 완료`)}`);
}
export async function confirmAction(data: FormData) {
  const me = await requireRole("HR");
  const empNo = String(data.get("empNo") ?? "");
  let error = "";
  try {
    const source = data.get("source");
    if (source !== "AUTO" && source !== "MANUAL") throw new BusinessError("INVALID_SOURCE", "확정 방식을 선택해 주세요.");
    await confirmStep(me, empNo, source === "AUTO" ? { source } : { source, date: String(data.get("date") ?? ""), reason: String(data.get("reason") ?? "") });
  } catch (e) {
    if (!(e instanceof BusinessError)) throw e;
    error = e.message;
  }
  revalidatePath("/hr/steps", "layout");
  redirect(`/hr/steps/${encodeURIComponent(empNo)}?${error ? `error=${encodeURIComponent(error)}` : "saved=1"}`);
}
