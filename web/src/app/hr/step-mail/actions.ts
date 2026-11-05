"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { loadRules } from "@/lib/rules";
import { BusinessError } from "@/lib/error";
import { sendStepMails, type StepMail } from "@/services/steps";

export type SendState = { today: string; error: string; mails: StepMail[]; ran: boolean };

export async function sendStepMailsAction(_previous: SendState, data: FormData): Promise<SendState> {
  const me = await requireRole("HR");
  const raw = data.get("today");
  const today = typeof raw === "string" && raw.trim() ? raw.trim() : (await loadRules()).defaultToday;
  try {
    const mails = await sendStepMails(me, today);
    revalidatePath("/hr/mails");
    revalidatePath("/me");
    revalidatePath("/me/mails");
    return { today, error: "", mails, ran: true };
  } catch (e) {
    if (!(e instanceof BusinessError)) throw e;
    return { today, error: e.message, mails: [], ran: false };
  }
}
