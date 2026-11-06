"use server";
import { requireRole } from "@/lib/session";
import { updateSetting } from "@/services/settings";
import { BusinessError } from "@/lib/error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function updateSettingAction(data: FormData) {
  const me = await requireRole("HR");
  let error = "";
  try { await updateSetting(me, String(data.get("key") ?? ""), String(data.get("value") ?? "")); }
  catch (e) { if (!(e instanceof BusinessError)) throw e; error = e.message; }
  revalidatePath("/hr", "layout");
  redirect(`/hr/settings?${error ? `error=${encodeURIComponent(error)}` : "saved=1"}`);
}
