import { describe, it, expect } from "vitest";
import { isStepNoticeTarget, isStepResultTarget } from "./mail-rules";

describe("isStepNoticeTarget", () => {
  it("30일 후 승급 예정자는 대상", () => {
    expect(isStepNoticeTarget("2026-12-01", "2026-11-01", 30)).toBe(true);
  });

  it("오늘 승급 예정자는 대상 아님", () => {
    expect(isStepNoticeTarget("2026-11-01", "2026-11-01", 30)).toBe(false);
  });

  it("31일 후 승급 예정자는 대상 아님", () => {
    expect(isStepNoticeTarget("2026-12-02", "2026-11-01", 30)).toBe(false);
  });

  it("확정일이 없으면 대상 아님", () => {
    expect(isStepNoticeTarget(null, "2026-11-01", 30)).toBe(false);
  });
});

describe("isStepResultTarget", () => {
  it("최근 30일 이내 발령은 대상", () => {
    expect(isStepResultTarget("2026-10-15", "2026-11-01", 30)).toBe(true);
  });

  it("31일 전 발령은 대상 아님", () => {
    expect(isStepResultTarget("2026-10-01", "2026-11-01", 30)).toBe(false);
  });

  it("오늘 발령도 대상", () => {
    expect(isStepResultTarget("2026-11-01", "2026-11-01", 30)).toBe(true);
  });
});
