// Run after npm test and npm run build. Uses a temporary COPY of test.db only.
// Requires Node 24+ and locally installed Chrome; no browser package is installed.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
assert(existsSync(chrome), "Set CHROME_PATH to an installed Chromium browser.");
assert(existsSync("test.db"), "Run npm test first to prepare the isolated test database.");
const work = mkdtempSync(join(tmpdir(), "promotion-print-"));
const database = join(work, "browser.db");
copyFileSync("test.db", database);
const db = new DatabaseSync(database);
assert(db.prepare("SELECT user_id FROM app_user WHERE user_id=?").get("hr01"));
const fixture = db.prepare("INSERT INTO promotion_round(name,base_date,apply_start,apply_end,status,created_at) VALUES(?,?,?,?,?,?)")
  .run("Isolated browser print check", "2026-12-31", "2027-01-04", "2027-01-15", "REVIEWING", "2026-11-01T00:00:00Z");
const roundId = Number(fixture.lastInsertRowid);
db.close();
const port = async () => {
  const server = createServer();
  await new Promise((done, fail) => server.once("error", fail).listen(0, "127.0.0.1", done));
  const number = server.address().port;
  await new Promise((done) => server.close(done));
  return number;
};
const serverPort = await port();
const debugPort = await port();
const origin = `http://127.0.0.1:${serverPort}`;
const secret = randomBytes(32).toString("hex");
const processes = [];
let socket;
async function until(check) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const result = await check(); if (result) return result; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Timed out waiting for browser/server readiness.");
}
try {
  processes.push(spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(serverPort)], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${database.replaceAll("\\", "/")}`, SESSION_SECRET: secret },
  }));
  await until(async () => (await fetch(`${origin}/login`)).ok);
  processes.push(spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking",
    `--user-data-dir=${join(work, "profile")}`, `--remote-debugging-port=${debugPort}`, "about:blank"], { windowsHide: true, stdio: "ignore" }));
  const targets = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const rows = await response.json(); return rows.find((r) => r.type === "page")?.webSocketDebuggerUrl;
  });
  socket = new WebSocket(targets);
  await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const response = JSON.parse(data);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id); clearTimeout(request.timeout);
    if (response.error) request.fail(new Error(response.error.message)); else request.done(response.result);
  });
  function command(method, params = {}) {
    return new Promise((done, fail) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 10000);
      pending.set(id, { done, fail, timeout }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await command("Runtime.evaluate", { expression, returnByValue: true });
    assert(!response.exceptionDetails, "Browser evaluation failed."); return response.result.value;
  }
  const signature = createHmac("sha256", secret).update("hr01").digest("hex");
  await command("Network.setCookie", { name: "uid", value: `hr01.${signature}`, url: origin, httpOnly: true, sameSite: "Lax" });
  await command("Page.navigate", { url: `${origin}/hr/rounds/${roundId}/review-data` });
  await until(() => evaluate('document.readyState === "complete" && !!document.querySelector("#download-reason")'));
  const probe = `(() => {
    const csv = document.querySelector('#download-reason').closest('section');
    const main = document.querySelector('main');
    return { csvDisplay: getComputedStyle(csv).display, classesConnected: !csv.className.includes('undefined') && !!main.className,
      requiredReason: document.querySelector('#download-reason').required,
      zeroSheets: main.querySelectorAll('article').length === 0,
      noPrintButton: !main.querySelector('button[type="button"]'),
      emptyGuidance: !!main.querySelector('[role="status"]'),
      sidebarDisplay: getComputedStyle(document.querySelector('.app-sidebar')).display,
      topbarDisplay: getComputedStyle(document.querySelector('.app-topbar')).display };
  })()`;
  await command("Emulation.setEmulatedMedia", { media: "screen" });
  const screen = await evaluate(probe);
  assert(screen.classesConnected && screen.requiredReason && screen.zeroSheets && screen.noPrintButton && screen.emptyGuidance);
  assert.notEqual(screen.csvDisplay, "none");
  await command("Emulation.setEmulatedMedia", { media: "print" });
  const print = await evaluate(probe);
  assert.equal(print.csvDisplay, "none");
  assert.equal(print.sidebarDisplay, "none");
  assert.equal(print.topbarDisplay, "none");
  console.log(JSON.stringify({ result: "PASS", browser: "headless Chrome via CDP", isolatedDatabase: true,
    screenCsvVisible: true, printCsvHidden: true, printMenusHidden: true, cssModuleClassesConnected: true,
    emptyStateGuidance: true, applicantA4Output: "NOT VERIFIED (zero confirmed applications)" }));
} finally {
  socket?.close();
  for (const process of processes.reverse()) process.kill();
  // Temporary browser artifacts remain outside the repository; no recursive cleanup.
}
