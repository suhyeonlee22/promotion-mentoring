"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { openNotification } from "@/services/notifications";
import { BusinessError } from "@/lib/error";

export async function openNotificationAction(data: FormData) {
  const me = await requireRole("HR");
  let destination: string;
  try { destination = await openNotification(me, Number(data.get("notiId"))); }
  catch (e) {
    if (!(e instanceof BusinessError)) throw e;
    redirect(`/hr/notifications?error=${encodeURIComponent(e.message)}`);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
