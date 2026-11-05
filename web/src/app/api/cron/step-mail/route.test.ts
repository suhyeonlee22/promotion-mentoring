import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendStepMails } from "@/services/steps";
import { GET } from "./route";
vi.mock("@/services/steps", () => ({ sendStepMails: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "test-cron-secret");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("잘못된 키, 누락된 인증, 빈 서버 비밀키는 401이며 서비스를 호출하지 않음", async () => {
  for (const authorization of ["", "Bearer wrong", "Basic test-cron-secret"]) {
    expect((await GET(new Request("http://localhost/api/cron/step-mail", { headers: { authorization } }))).status).toBe(401);
  }
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("http://localhost/api/cron/step-mail", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", undefined);
  expect((await GET(new Request("http://localhost/api/cron/step-mail", { headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
  expect(sendStepMails).not.toHaveBeenCalled();
});
it("인증 성공 200, 실제 KST 날짜와 SYSTEM으로 실행하고 새 메일 건수 반환", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-31T16:00:00Z"));
  vi.mocked(sendStepMails).mockResolvedValue([]);
  const response = await GET(new Request("http://localhost/api/cron/step-mail", { headers: { authorization: "Bearer test-cron-secret" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ today: "2026-11-01", sent: 0 });
  expect(sendStepMails).toHaveBeenCalledWith({ userId: "SYSTEM", name: "시스템", role: "HR", empNo: null }, "2026-11-01");
});
