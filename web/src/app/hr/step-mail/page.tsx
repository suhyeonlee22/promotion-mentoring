import { requireRole } from "@/lib/session";
import { loadRules } from "@/lib/rules";
import SendForm from "./send-form";

export default async function StepMailPage() {
  await requireRole("HR");
  const rules = await loadRules();
  return <main className="space-y-6 p-6"><h1 className="text-2xl font-bold">승급 안내 메일</h1>
    <p>확정 차기승급일과 승급 발령을 기준으로 안내 메일을 발송함에 기록합니다.</p>
    <SendForm defaultToday={rules.defaultToday}/>
  </main>;
}
