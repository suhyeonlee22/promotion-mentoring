import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ruleConfig } from "@/db/schema";
import { BusinessError } from "@/lib/error";
import { recordHistory } from "@/lib/history";
import { parseRules } from "@/lib/rules";
import { addDays } from "@/domain/date";
import { LEAVE_TYPES, DISCIPLINE_TYPES } from "@/lib/codes";
import type { CurrentUser } from "@/lib/session";

export async function updateSetting(me: CurrentUser | null, key: string, value: string): Promise<void> {
  if (me?.role !== "HR") throw new BusinessError("FORBIDDEN", "인사팀만 기준정보를 변경할 수 있습니다.");
  const cleaned = value.trim();
  if (!cleaned) throw new BusinessError("INVALID_RULE", "값을 입력해 주세요.");
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(ruleConfig);
    const old = rows.find((r) => r.key === key);
    if (!old) throw new BusinessError("NOT_FOUND", "기준정보를 찾을 수 없습니다.");
    const types = key === "period.non_counting_leave" ? LEAVE_TYPES : key === "period.non_counting_discipline" ? DISCIPLINE_TYPES : null;
    if (types) {
      if (cleaned.split(",").some((code) => !Object.keys(types).includes(code.trim()))) throw new BusinessError("INVALID_RULE", "지원하는 휴직·징계 코드를 쉼표로 구분해 입력해 주세요.");
    } else if (key === "system.default_today") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || addDays(cleaned, 0) !== cleaned) throw new BusinessError("INVALID_RULE", "올바른 기준일을 입력해 주세요.");
    } else if (!/^\d+$/.test(cleaned) || !Number.isSafeInteger(Number(cleaned)) || (key === "step.cycle_months" && Number(cleaned) < 1)) throw new BusinessError("INVALID_RULE", "올바른 정수를 입력해 주세요. 승급 주기는 1개월 이상이어야 합니다.");
    try { parseRules(rows.map((r) => r.key === key ? { ...r, value: cleaned } : r)); }
    catch { throw new BusinessError("INVALID_RULE", "기준정보 값이 올바르지 않습니다."); }
    if (old.value === cleaned) return;
    await tx.update(ruleConfig).set({ value: cleaned }).where(eq(ruleConfig.key, key));
    await recordHistory(tx, { entityType: "SETTING", entityId: key, action: "SETTING_UPDATED", detail: { before: old.value, after: cleaned }, actor: me.userId });
  });
}
