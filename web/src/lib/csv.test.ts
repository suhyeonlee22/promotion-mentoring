import { describe, expect, it } from "vitest";
import { encodeCsv } from "./csv";

describe("CSV 인코딩", () => {
  it("한글 BOM과 CRLF를 포함하고 쉼표·따옴표·여러 줄을 보존한다", () => {
    expect(encodeCsv([["성명", "포상"], ["김직원", '표창, "우수"\r\n다음 줄']]))
      .toBe('\uFEFF"성명","포상"\r\n"김직원","표창, ""우수""\r\n다음 줄"\r\n');
  });
  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "  =1", "\t=1", "\r=1", "\n=1", "\u0000=1", "＝1", "＋1", "－1", "＠SUM(A1)"])(
    "수식 후보 %j를 인용된 셀 안에서 텍스트로 보호한다", (value) => {
      expect(encodeCsv([[value]])).toBe(`\uFEFF"\t${value}"\r\n`);
    },
  );
  it("셀 경계로 탈출하려는 값도 하나의 셀로 인용한다", () => {
    expect(encodeCsv([['정상",=HYPERLINK("주소")', ""]]))
      .toBe('\uFEFF"정상"",=HYPERLINK(""주소"")",""\r\n');
  });
});
