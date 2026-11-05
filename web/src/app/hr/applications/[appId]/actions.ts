"use server";
import { requireRole } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { application, correctionRequest } from "@/db/schema";
import { BusinessError } from "@/lib/error";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { returnApplication, confirmApplication, approveCorrection, rejectCorrection } from "@/services/applications";

async function getApplicationContext(data: FormData) {
  const me = await requireRole("HR");
  const appId = Number(data.get("appId"));
  if (!Number.isSafeInteger(appId) || appId <= 0) notFound();
  const [app] = await db.select().from(application).where(eq(application.appId, appId));
  if (!app) notFound();
  return { me, appId, roundId: app.roundId };
}

async function handleCorrection(data: FormData, decision: "approve" | "reject") {
  const { me, appId, roundId } = await getApplicationContext(data);
  const reqId = Number(data.get("reqId"));
  let error = "";
  try {
    if (!Number.isSafeInteger(reqId) || reqId <= 0) {
      throw new BusinessError("INVALID_CORRECTION", "올바른 정정 요청을 선택해 주세요.");
    }
    // 폼의 요청 번호만 신뢰하지 않고 대상 신청서에 속한 요청인지 검증한다.
    const [req] = await db.select().from(correctionRequest).where(and(
      eq(correctionRequest.reqId, reqId), eq(correctionRequest.appId, appId),
    ));
    if (!req) {
      throw new BusinessError("INVALID_CORRECTION", "해당 신청서의 정정 요청이 아닙니다.");
    }
    if (decision === "approve") {
      await approveCorrection(me, reqId, String(data.get("appliedValue") ?? ""));
    } else {
      await rejectCorrection(me, reqId, String(data.get("feedback") ?? ""));
    }
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else throw e;
  }
  const path = `/hr/applications/${appId}`;
  revalidatePath(path);
  revalidatePath(`/hr/rounds/${roundId}/applications`);
  revalidatePath("/me/promotion");
  redirect(`${path}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function approveCorrectionAction(data: FormData) {
  await handleCorrection(data, "approve");
}

export async function rejectCorrectionAction(data: FormData) {
  await handleCorrection(data, "reject");
}

export async function returnApplicationAction(data: FormData) {
  const { me, appId } = await getApplicationContext(data);
  const reason = String(data.get("reason") ?? "");

  let error = "";
  try {
    await returnApplication(me, appId, reason);
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }
  revalidatePath(`/hr/applications/${appId}`);
  redirect(
    `/hr/applications/${appId}${error ? `?error=${encodeURIComponent(error)}` : ""}`,
  );
}

export async function confirmApplicationAction(data: FormData) {
  const { me, appId } = await getApplicationContext(data);
  let error = "";
  try {
    await confirmApplication(me, appId);
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }
  revalidatePath(`/hr/applications/${appId}`);
  redirect(
    `/hr/applications/${appId}${error ? `?error=${encodeURIComponent(error)}` : ""}`,
  );
}
