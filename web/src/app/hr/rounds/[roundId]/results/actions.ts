"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { application } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import { registerResult, notifyResults } from "@/services/applications";

function readId(data: FormData, name: string) {
  const value = Number(data.get(name));
  if (!Number.isSafeInteger(value) || value <= 0) notFound();
  return value;
}

export async function registerResultAction(data: FormData) {
  const me = await requireRole("HR");
  const roundId = readId(data, "roundId");
  const appId = readId(data, "appId");
  let error = "";
  try {
    const result = data.get("result");
    if (result !== "PROMOTED" && result !== "NOT_PROMOTED") {
      throw new BusinessError("INVALID_RESULT", "승진 또는 미승진을 선택해 주세요.");
    }
    const [app] = await db.select().from(application).where(and(
      eq(application.appId, appId), eq(application.roundId, roundId),
    ));
    if (!app) throw new BusinessError("INVALID_APPLICATION", "해당 회차의 신청서가 아닙니다.");
    await registerResult(me, appId, result);
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else throw e;
  }
  revalidatePath(`/hr/rounds/${roundId}/results`);
  revalidatePath(`/hr/applications/${appId}`);
  revalidatePath("/me/promotion");
  redirect(`/hr/rounds/${roundId}/results${error ? `?error=${encodeURIComponent(error)}` : "?saved=1"}`);
}

export async function notifyResultsAction(data: FormData) {
  const me = await requireRole("HR");
  const roundId = readId(data, "roundId");
  let error = "";
  let sent = 0;
  try {
    sent = await notifyResults(me, roundId);
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else throw e;
  }
  revalidatePath(`/hr/rounds/${roundId}/results`);
  revalidatePath("/hr/mails");
  revalidatePath("/me/mails");
  revalidatePath("/me/promotion");
  revalidatePath("/hr/applications/[appId]", "page");
  redirect(`/hr/rounds/${roundId}/results${error ? `?error=${encodeURIComponent(error)}` : `?sent=${sent}`}`);
}
