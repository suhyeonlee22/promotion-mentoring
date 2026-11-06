import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(join(directory, entry.name)) : entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [join(directory, entry.name)] : []);
}
it("입력란 label 연결·표 헤더 scope·양수 tabIndex 부재를 전 화면 소스에서 검사", () => {
  const problems: string[] = [];
  for (const file of [...files("src/app"), ...files("src/components")]) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const elements: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
    function walk(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
      ts.forEachChild(node, walk);
    }
    walk(source);
    const attr = (node: typeof elements[number], name: string) => node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === name) as ts.JsxAttribute | undefined;
    const value = (node: typeof elements[number], name: string) => attr(node, name)?.initializer?.getText(source);
    for (const node of elements) {
      const tag = node.tagName.getText(source);
      const location = `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
      if (tag === "th" && !attr(node, "scope")) problems.push(`${location} 표 헤더 scope 누락`);
      if (value(node, "tabIndex") && !["{0}", "{-1}", '"0"', '"-1"'].includes(value(node, "tabIndex")!)) problems.push(`${location} tabIndex 검토 필요`);
      if (!["input", "textarea", "select"].includes(tag) || value(node, "type") === '"hidden"') continue;
      let parent = node.parent;
      let wrapped = false;
      while (parent) {
        if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === "label") { wrapped = true; break; }
        parent = parent.parent;
      }
      const id = value(node, "id");
      const linked = id && elements.some((label) => label.tagName.getText(source) === "label" && value(label, "htmlFor") === id);
      if (!wrapped && !linked) problems.push(`${location} ${tag} label 연결 누락`);
    }
  }
  expect(problems).toEqual([]);
});
