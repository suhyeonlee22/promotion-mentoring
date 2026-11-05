import { todayKst } from "@/domain/date";
import { sendStepMails } from "@/services/steps";

const SYSTEM = { userId: "SYSTEM", name: "시스템", role: "HR" as const, empNo: null };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const today = todayKst(new Date());
  const mails = await sendStepMails(SYSTEM, today);
  return Response.json({ today, sent: mails.length });
}
