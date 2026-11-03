"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import { approveCorrection, rejectCorrection } from "@/services/applications";

export async function approveCorrectionAction(data: FormData): Promise<void> {
  const me = await getCurrentUser();

  const roundId = Number(data.get("roundId"));
  const reqId = Number(data.get("reqId"));
  const appliedValue = String(data.get("appliedValue") ?? "");

  let error = "";

  try {
    await approveCorrection(me, reqId, appliedValue);
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }

  const path = `/hr/rounds/${roundId}/applications`;
  revalidatePath(path);

  redirect(
    error ? `${path}?error=${encodeURIComponent(error)}` : `${path}?approved=1`,
  );
}

export async function rejectCorrectionAction(data: FormData): Promise<void> {
  const me = await getCurrentUser();

  const roundId = Number(data.get("roundId"));
  const reqId = Number(data.get("reqId"));
  const feedback = String(data.get("feedback") ?? "");

  let error = "";

  try {
    await rejectCorrection(me, reqId, feedback);
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }

  const path = `/hr/rounds/${roundId}/applications`;
  revalidatePath(path);

  redirect(
    error ? `${path}?error=${encodeURIComponent(error)}` : `${path}?rejected=1`,
  );
}
