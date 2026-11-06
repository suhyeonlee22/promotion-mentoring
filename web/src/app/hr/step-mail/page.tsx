import { PageHeader } from "@/components/ui/workspace";
import { requireRole } from "@/lib/session";
import { loadRules } from "@/lib/rules";
import SendForm from "./send-form";

export default async function StepMailPage() {
  await requireRole("HR");
  const rules = await loadRules();
  return <main className="workspace-page"><PageHeader description="입력한 기준일로 승급 예정 및 결과 안내를 생성합니다." className="text-2xl font-bold">승급 안내 메일</PageHeader>
    <p>확정 차기승급일과 승급 발령을 기준으로 안내 메일을 발송함에 기록합니다.</p>
    <SendForm defaultToday={rules.defaultToday}/>
  </main>;
}
