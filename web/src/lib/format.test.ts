
import { describe, it, expect } from "vitest";
import { APP_STATUS } from "./codes";
import {
  gradeLabel,
  statusLabel,
  maskPhone,
  orDash,
} from "./format";

describe("format.ts 테스트", () => {
  it("직급 코드를 한글로 변환한다", () => {
    expect(gradeLabel("G7")).toBe("7급");
    expect(gradeLabel("G3")).toBe("3급");
  });

  it("신청서 상태를 한글로 변환한다", () => {
    expect(statusLabel(APP_STATUS, "DRAFT")).toBe("작성 중");
    expect(statusLabel(APP_STATUS, null)).toBe("-");
  });

  it("전화번호 가운데 자리를 숨긴다", () => {
    expect(maskPhone("010-2001-1001")).toBe(
      "010-****-1001"
    );
  });

  it("값이 없으면 '-'를 표시한다", () => {
    expect(orDash(null)).toBe("-");
    expect(orDash(undefined)).toBe("-");
    expect(orDash("")).toBe("-");
    expect(orDash(0)).toBe("0");
  });
});
