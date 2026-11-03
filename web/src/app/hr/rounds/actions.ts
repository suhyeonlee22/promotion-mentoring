"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { BusinessError } from "@/lib/error";
import { createRound, runSelection, setManualAction, changeRoundStatus } from "@/services/rounds";

export async function createRoundAction(data: FormData) {
  const me = await getCurrentUser();
  let error = "";
  let roundId = 0;
  try {
    roundId = await createRound(me, { name: String(data.get("name") ?? ""), baseDate: String(data.get("baseDate") ?? ""), applyStart: String(data.get("applyStart") ?? ""), applyEnd: String(data.get("applyEnd") ?? "") });
  } catch (e) {
    if (e instanceof BusinessError) error = e.message;
    else throw e;
  }
  revalidatePath("/hr/rounds");
  redirect(error ? `/hr/rounds?error=${encodeURIComponent(error)}` : `/hr/rounds/${roundId}/candidates`);
}

export async function selectionAction(data: FormData) {
  const me = await getCurrentUser();
  const roundId = Number(data.get("roundId"));
  let error = "";
  try { await runSelection(me, roundId); }
  catch (e) { if (e instanceof BusinessError) error = e.message; else throw e; }
  revalidatePath("/hr/rounds", "layout");
  redirect(`/hr/rounds/${roundId}/candidates${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function manualAction(data: FormData) {
  const me = await getCurrentUser();
  const roundId = Number(data.get("roundId"));
  let error = "";
  try {
    await setManualAction(me, roundId, String(data.get("empNo") ?? ""), String(data.get("action")) as "ADD" | "EXCLUDE" | "NONE", String(data.get("reason") ?? ""));
  } catch (e) { if (e instanceof BusinessError) error = e.message; else throw e; }
  revalidatePath("/hr/rounds", "layout");
  redirect(`/hr/rounds/${roundId}/candidates${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function statusAction(data: FormData) {
  const me = await getCurrentUser();
  const roundId = Number(data.get("roundId"));
  let error = "";
  try { await changeRoundStatus(me, roundId, String(data.get("to")) as "APPLYING" | "REVIEWING" | "RESULT"); }
  catch (e) { if (e instanceof BusinessError) error = e.message; else throw e; }
  revalidatePath("/hr/rounds", "layout");
  redirect(`/hr/rounds${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}
