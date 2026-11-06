import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

// 라우팅/폼 계약을 유지하면서 화면 구성 요소만 바꾸는지 확인한다.
const pages = [
  ["hr/rounds/page.tsx", ["createRoundAction", "statusAction"], ["name", "baseDate", "applyStart", "applyEnd", "roundId", "to"]],
  ["hr/rounds/[roundId]/candidates/page.tsx", ["selectionAction", "manualAction"], ["roundId", "empNo", "reason", "action"]],
  ["hr/rounds/[roundId]/applications/page.tsx", ["approveCorrectionAction", "rejectCorrectionAction"], ["roundId", "reqId", "appliedValue", "feedback"]],
  ["hr/applications/[appId]/page.tsx", ["approveCorrectionAction", "rejectCorrectionAction", "returnApplicationAction", "confirmApplicationAction"], ["appId", "reqId", "appliedValue", "feedback", "reason"]],
  ["hr/rounds/[roundId]/results/page.tsx", ["registerResultAction", "notifyResultsAction"], ["roundId", "appId", "result"]],
  ["hr/steps/page.tsx", ["recalcAction", "bulkConfirmAction"], []],
  ["hr/steps/[empNo]/page.tsx", ["confirmAction"], ["empNo", "source", "date", "reason"]],
  ["hr/notifications/page.tsx", ["openNotificationAction"], ["notiId"]],
  ["hr/settings/page.tsx", ["updateSettingAction"], ["key", "value"]],
  ["hr/mock-erp/page.tsx", ["editMockErpAction"], ["apptId", "empNo", "apptType", "subType", "startDate", "endDate", "stepAfter", "gradeAfter", "memo", "operation", "nextStepDate"]],
  ["hr/mails/page.tsx", [], ["type", "recipient"]],
  ["hr/history/page.tsx", [], ["entityType", "entityId", "actor", "from", "to"]],
  ["hr/access-logs/page.tsx", [], ["userId", "subjectEmpNo", "action", "from", "to"]],
  ["hr/step-mail/send-form.tsx", ["action"], ["today"]],
  ["me/promotion/page.tsx", ["requestCorrectionAction"], ["appId", "itemKey", "requestedValue", "reason"]],
  ["me/promotion/application-form.tsx", ["submit", "saveDraftAction"], ["appId", "achievement", "plan"]],
  ["login/page.tsx", ["loginAction"], ["userId", "password"]],
  ["switch-user/page.tsx", ["switchUserAction.bind(null, user.userId)"], []],
] as const;

it.each(pages)("%s의 기존 액션·필드 계약 유지", (file, actions, names) => {
  const text = readFileSync(`src/app/${file}`, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const actualActions: string[] = [];
  const actualNames: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(source);
      if (["action", "formAction"].includes(name) && ts.isJsxExpression(node.initializer) && node.initializer.expression) actualActions.push(node.initializer.expression.getText(source));
      if (name === "name" && ts.isStringLiteral(node.initializer)) actualNames.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const action of actions) expect(actualActions).toContain(action);
  for (const name of names) expect(actualNames).toContain(name);
  expect(text).not.toMatch(/description="\?{3,}/);
});

it("인쇄 페이지는 업무 화면 래퍼를 사용하지 않고 기존 A4 페이지 분리 유지", () => {
  const view = readFileSync("src/app/hr/rounds/[roundId]/review-data/page.tsx", "utf8");
  const css = readFileSync("src/app/hr/rounds/[roundId]/review-data/review-data.module.css", "utf8");
  expect(view).not.toContain("workspace-page"); expect(view).not.toContain("DataTable");
  expect(css).toContain("size: A4 portrait"); expect(css).toContain("break-before: page"); expect(css).toContain("break-inside: avoid");
});

it.each([
  ["hr/rounds/page.tsx", ["/hr/rounds/${r.roundId}/candidates", "/hr/rounds/${r.roundId}/results"]],
  ["hr/rounds/[roundId]/candidates/page.tsx", ["/hr/rounds", "?empNo=${c.empNo}#evidence"]],
  ["hr/rounds/[roundId]/results/page.tsx", ["/hr/rounds", "/hr/mails"]],
  ["hr/steps/page.tsx", ["/hr/steps", "/hr/steps?status=${code}", "/hr/steps/${r.empNo}"]],
  ["hr/steps/[empNo]/page.tsx", ["/hr/steps"]],
  ["hr/mock-erp/page.tsx", ["/hr/steps", "/hr/mock-erp?table=src_appointment", "/hr/mock-erp?table=src_manual_step_ledger"]],
  ["me/page.tsx", ["/me/mails", "/me/promotion"]],
  ["login/page.tsx", ["/switch-user"]],
])("%s의 기존 이동 경로 유지", (file, expected) => {
  const text = readFileSync(`src/app/${file}`, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hrefs: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "href" && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) hrefs.push(node.initializer.text);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) hrefs.push(node.initializer.expression.getText(source).replace(/^`|`$/g, ""));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const href of expected) expect(hrefs).toContain(href);
});
