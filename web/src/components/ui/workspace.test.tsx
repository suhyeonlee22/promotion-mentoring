import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { beforeEach, expect, it, vi } from "vitest";
import { DataTable, FilterBar, PageHeader, StatusBadge, Surface } from "./workspace";
beforeEach(() => vi.stubGlobal("React", React));
it("공통 표는 caption·열/행 헤더와 링크를 유지하고 키보드 가로 스크롤 영역 제공", () => {
  const html = renderToStaticMarkup(<DataTable label="선정 결과"><caption>실제 대상자</caption><thead><tr><th scope="col">사번</th></tr></thead><tbody><tr><th scope="row"><Link href="/hr/steps/U1001" prefetch={false}>U1001</Link></th></tr></tbody></DataTable>);
  expect(html).toContain('role="region"'); expect(html).toContain('tabindex="0"'); expect(html).toContain('aria-label="선정 결과"');
  expect(html).toContain("<caption>실제 대상자</caption>"); expect(html).toContain('scope="col"'); expect(html).toContain('scope="row"'); expect(html).toContain('href="/hr/steps/U1001"');
});
it("필터 바는 GET 방식·필드명·기존 값·필수 조건을 그대로 전달", () => {
  const html = renderToStaticMarkup(<FilterBar method="get"><label>시작일<input type="date" name="from" defaultValue="2026-11-01" required/></label><button>조회</button></FilterBar>);
  expect(html).toContain('method="get"'); expect(html).toContain('name="from"'); expect(html).toContain('value="2026-11-01"'); expect(html).toContain('required=""');
});
it("제목과 패널은 실제 내용·ID·접근성 속성을 유지하고 상태는 텍스트로 표시", () => {
  const html = renderToStaticMarkup(<><PageHeader description="업무 설명">실제 회차</PageHeader><Surface id="evidence" aria-label="판정 근거"><h2>계산 근거</h2><StatusBadge status="MISMATCH"/></Surface></>);
  expect(html).toContain("실제 회차"); expect(html).toContain('id="evidence"'); expect(html).toContain('aria-label="판정 근거"');
  expect(html).toContain('data-status="MISMATCH"'); expect(html).toContain("불일치");
});
