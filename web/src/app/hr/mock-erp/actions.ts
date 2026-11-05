"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import { deleteAppointment, saveAppointment, updateManualLedger } from "@/services/mock-erp";

export async function editMockErpAction(data: FormData) {
  const me = await requireRole("HR");
  const read = (key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";
  const operation = read("operation");
  const table = operation === "LEDGER" ? "src_manual_step_ledger" : "src_appointment";
  let error = "";
  try {
    if (operation === "DELETE") await deleteAppointment(me, read("apptId"));
    else if (operation === "LEDGER") await updateManualLedger(me, read("empNo"), { nextStepDate: read("nextStepDate") || null, memo: read("memo") || null });
    else if (operation === "ADD" || operation === "UPDATE") {
      await saveAppointment(me, operation, {
        apptId: read("apptId"), empNo: read("empNo"), apptType: read("apptType"),
        subType: read("subType") || null, startDate: read("startDate"), endDate: read("endDate") || null,
        stepAfter: read("stepAfter") ? Number(read("stepAfter")) : null,
        gradeAfter: read("gradeAfter") || null, memo: read("memo") || null,
      });
    } else throw new BusinessError("INVALID_ACTION", "올바른 편집 작업을 선택해 주세요.");
  } catch (e) {
    if (!(e instanceof BusinessError)) throw e;
    error = e.message;
  }
  revalidatePath("/hr/mock-erp");
  redirect(`/hr/mock-erp?table=${table}&${error ? `error=${encodeURIComponent(error)}` : "saved=1"}`);
}
