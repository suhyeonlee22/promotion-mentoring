import { db } from "@/db/client";
import { ruleConfig } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { updateSettingAction } from "./actions";
export default async function SettingsPage({ searchParams }: PageProps<"/hr/settings">) {
  await requireRole("HR");
  const rows = await db.select().from(ruleConfig).orderBy(ruleConfig.key);
  const query = await searchParams;
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-bold">기준정보</h1><p>변경된 규칙은 다음 선정·재계산·안내 발송부터 적용됩니다. 기존 확정값은 유지됩니다.</p>
    {typeof query.error === "string" && <p role="alert">{query.error}</p>}{query.saved && <p role="status">저장했습니다.</p>}
    {rows.map((r) => <form action={updateSettingAction} key={r.key} className="space-y-2 rounded border p-4"><input type="hidden" name="key" value={r.key}/><label className="block">{r.description} ({r.key}) <input name="value" defaultValue={r.value} required className="rounded border p-2"/></label><button className="rounded border px-4 py-2">기준정보 저장</button></form>)}
  </main>;
}
