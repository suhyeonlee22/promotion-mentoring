// saveDraft() 서비스를 버튼과 연결
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import {
  saveDraft,
  submitApplication,
  requestCorrection,
} from "@/services/applications";

export async function saveDraftAction(data: FormData): Promise<void> {
  const me = await getCurrentUser();
  const appId = Number(data.get("appId"));

  let error = "";

  try {
    await saveDraft(me, appId, {
      achievement: String(data.get("achievement") ?? ""),
      plan: String(data.get("plan") ?? ""),
    });
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }

  revalidatePath("/me/promotion");

  redirect(
    error
      ? `/me/promotion?error=${encodeURIComponent(error)}`
      : "/me/promotion?saved=1",
  );
}

export async function submitApplicationAction(data: FormData): Promise<void> {
  const me = await getCurrentUser();
  const appId = Number(data.get("appId"));

  let error = "";

  try {
    await submitApplication(me, appId, {
      achievement: String(data.get("achievement") ?? ""),
      plan: String(data.get("plan") ?? ""),
    });
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }

  revalidatePath("/me/promotion");

  redirect(
    error
      ? `/me/promotion?error=${encodeURIComponent(error)}`
      : "/me/promotion?submitted=1",
  );
}

export async function requestCorrectionAction(data: FormData): Promise<void> {
  const me = await getCurrentUser();

  const appId = Number(data.get("appId"));
  const itemKey = String(data.get("itemKey") ?? "");
  const requestedValue = String(data.get("requestedValue") ?? "");
  const reason = String(data.get("reason") ?? "");

  let error = "";

  try {
    await requestCorrection(me, appId, {
      itemKey,
      requestedValue,
      reason,
    });
  } catch (e) {
    if (e instanceof BusinessError) {
      error = e.message;
    } else {
      throw e;
    }
  }

  revalidatePath("/me/promotion");

  redirect(
    error
      ? `/me/promotion?error=${encodeURIComponent(error)}`
      : "/me/promotion?correction=1",
  );
}
