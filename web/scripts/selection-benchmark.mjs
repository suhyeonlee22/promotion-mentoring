import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { acquireSelectionLock } from "./selection-lock.mjs";

const web = fileURLToPath(new URL("../", import.meta.url));
assert.equal(process.env.DATABASE_URL, "file:performance.db");
assert.equal(process.env.DATABASE_AUTH_TOKEN, "");
process.chdir(web);
const file = "performance.db";
const baseline = "8bd275aaa13c6e44ad6ebf33f9353a2fb83ccf32";
const samples = Number(process.argv[2] ?? 7);
assert(Number.isSafeInteger(samples) && samples >= 3);
assert(existsSync(file));
const releaseLock = acquireSelectionLock();
try {
  benchmark();
} finally {
  releaseLock();
}

function benchmark() {
  function assertClosed() {
    for (const suffix of ["-wal", "-shm", "-journal"]) assert(!existsSync(file + suffix), file + suffix);
  }
  assertClosed();
  mkdirSync("backups", { recursive: true });
  const dir = mkdtempSync("backups/selection-");
  copyFileSync(file, dir + "/original.db");
  console.error("Artifacts: " + dir);
  writeFileSync(dir + "/previous-measurements.json", JSON.stringify([
    { employees: 12, run: "first", ms: 39.74, total: 11, auto: 4, final: 4 },
    { employees: 12, run: "repeat", ms: 36.71, total: 11, auto: 4, final: 4 },
    { employees: 500, run: "first", ms: 335.01, total: 459, auto: 167, final: 167 },
  ], null, 2));

  const tables = ["src_employee", "src_appointment", "src_evaluation", "src_training", "src_award"];
  const keys = { src_appointment: "appt_id", src_award: "award_id" };
  function seed(size) {
    const db = new DatabaseSync(file);
    try {
      db.exec("BEGIN IMMEDIATE");
      const templates = db.prepare("SELECT emp_no FROM src_employee WHERE emp_no GLOB 'PERF[0-9]*' ORDER BY emp_no").all();
      assert.equal(templates.length, 488);
      assert.equal(db.prepare("SELECT status FROM promotion_round WHERE round_id = 2").get().status, "PREPARING");
      for (const table of tables) {
        if (size === 12) {
          db.exec("DELETE FROM " + table + " WHERE emp_no GLOB 'PERF[0-9]*'");
        } else if (size === 2000) {
          const columns = db.prepare("PRAGMA table_info(" + table + ")").all().map(({ name }) => name);
          const expressions = columns.map((column) => {
            if (column === "emp_no") return "$id";
            if (column === keys[table]) return "$id || '-' || " + column;
            if (table === "src_employee" && column === "name") return "'Synthetic ' || $id";
            if (table === "src_employee" && column === "email") return "$id || '@example.invalid'";
            return column;
          });
          const insert = db.prepare("INSERT INTO " + table + " (" + columns.join(",") + ") SELECT " +
            expressions.join(",") + " FROM " + table + " WHERE emp_no = $template");
          for (let i = 0; i < 1500; i++) {
            const id = "PERF" + String(i + 489).padStart(5, "0");
            insert.run({ id, template: templates[i % templates.length].emp_no });
          }
        }
      }
      db.exec("DELETE FROM promotion_candidate WHERE round_id = 2");
      const counts = Object.fromEntries(tables.map((table) => {
        if (table !== "src_employee") {
          assert.equal(db.prepare("SELECT count(*) AS n FROM " + table +
            " t LEFT JOIN src_employee e USING(emp_no) WHERE e.emp_no IS NULL").get().n, 0);
        }
        return [table, db.prepare("SELECT count(*) AS n FROM " + table).get().n];
      }));
      assert.equal(counts.src_employee, size);
      db.exec("COMMIT");
      return counts;
    } finally {
      db.close();
    }
  }

  const modules = { erp: "src/services/erp.ts", rounds: "src/services/rounds.ts", history: "src/lib/history.ts" };
  const sha = (data) => createHash("sha256").update(data).digest("hex");
  function readSource(version, path) {
    return version === "before"
      ? execFileSync("git", ["show", baseline + ":web/" + path], { encoding: "utf8" })
      : readFileSync(path, "utf8");
  }
  function replace(source, needle, replacement) {
    assert(source.includes(needle), "Instrumentation anchor missing: " + needle);
    return source.replace(needle, replacement);
  }
  function instrument(name, source) {
    if (name === "erp") {
      source = replace(source, "  const employees = await reader", "  const queryStart = performance.now();\n  const employees = await reader");
      source = replace(source, "  const awards = await reader.select().from(srcAward);",
        '  const awards = await reader.select().from(srcAward);\n  mark("erpQueries", queryStart);');
    }
    if (name === "rounds") {
      source = replace(source, "const employees = await loadErpEmployees(tx);",
        'const erpStart = performance.now();\n    const employees = await loadErpEmployees(tx);\n    mark("erpTotal", erpStart);');
      const lookup = source.match(/const old = (?:previous\.find\([^\r\n]+|previousByEmpNo\.get\([^\r\n]+);/);
      assert(lookup);
      source = replace(source, lookup[0], 'const lookupStart = performance.now();\n      ' + lookup[0] + '\n      mark("candidateLookup", lookupStart);');
      source = source.replace(/const previousByEmpNo = new Map\([\s\S]*?\);/,
        'const lookupBuildStart = performance.now();\n    $&\n    mark("candidateLookupBuild", lookupBuildStart);');
      const upsert = /await tx\s*\.insert\(promotionCandidate\)[\s\S]*?\}\);/;
      assert(upsert.test(source));
      source = source.replace(upsert, 'const upsertStart = performance.now();\n      $&\n      mark("candidateUpsert", upsertStart);');
    }
    if (name === "history") {
      source = replace(source, "  await tx.insert(processHistory).values({",
        '  const historyStart = performance.now();\n  const jsonStart = performance.now();\n  const detailJson = h.detail ? JSON.stringify(h.detail) : null;\n  mark("historyJson", jsonStart);\n  await tx.insert(processHistory).values({');
      source = replace(source, "detailJson: h.detail ? JSON.stringify(h.detail) : null,", "detailJson,");
      source = replace(source, "  });", '  });\n  mark("historyTotal", historyStart);');
    }
    return 'import { mark } from "../../../scripts/selection-timing";\n' + source;
  }

  function worker(version, profile) {
    return JSON.parse(execFileSync(process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "--experimental-transform-types", "--import", "./scripts/selection-imports.mjs", "scripts/selection-sample.ts", "../" + dir + "/" + version + (profile ? "-profile" : "") + "/rounds.ts"],
      { encoding: "utf8" }));
  }
  function restore(snapshot) {
    assertClosed();
    copyFileSync(snapshot, file);
  }
  function stats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
      mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    };
  }

  const result = { baseline, node: process.version, platform: process.platform, release: release(),
    cpu: cpus()[0]?.model, samples, originalSha256: sha(readFileSync(file)), source: {}, datasets: {} };
  let completed = false;
  const generated = [];
  try {
    for (const version of ["before", "after"]) {
      result.source[version] = {};
      for (const profile of [false, true]) {
        const dest = dir + "/" + version + (profile ? "-profile" : "");
        mkdirSync(dest);
        generated.push(dest);
        for (const [name, path] of Object.entries(modules)) {
          let source = readSource(version, path);
          result.source[version][name] = sha(source);
          source = source.replace('from "@/lib/history"', 'from "./history"');
          writeFileSync(dest + "/" + name + ".ts", profile ? instrument(name, source) : source);
        }
      }
    }
    for (const size of [12, 500, 2000]) {
      restore(dir + "/original.db");
      const counts = seed(size);
      const first = dir + "/" + size + "-first.db";
      const repeat = dir + "/" + size + "-repeat.db";
      assertClosed();
      copyFileSync(file, first);
      worker("before", false);
      assertClosed();
      copyFileSync(file, repeat);
      const dataset = result.datasets[size] = { counts, first: {}, repeat: {} };
      for (const [mode, snapshot] of [["first", first], ["repeat", repeat]]) {
        const runs = dataset[mode];
        for (const version of ["before", "after"]) runs[version] = { timings: [], profiles: [] };
        restore(snapshot);
        const { digest, summary, historyBytes } = worker("before", false);
        Object.assign(runs, { digest, summary, historyBytes });
        restore(snapshot);
        assert.equal(worker("after", false).digest, digest);
        // Alternate order and restore the exact same bytes before every run.
        for (const profile of [false, true]) {
          for (let i = 0; i < samples; i++) {
            for (const version of i % 2 ? ["after", "before"] : ["before", "after"]) {
              restore(snapshot);
              const sample = worker(version, profile);
              assert.equal(sample.digest, digest);
              assert.deepEqual(sample.summary, summary);
              runs[version][profile ? "profiles" : "timings"].push(profile ? sample : sample.ms);
            }
          }
        }
        for (const version of ["before", "after"]) {
          runs[version].statistics = stats(runs[version].timings);
        }
        console.error(size + " " + mode + " complete");
      }
    }
    completed = true;
  } finally {
    restore(dir + "/original.db");
    assert.equal(sha(readFileSync(file)), result.originalSha256);
    writeFileSync(dir + "/results.json", JSON.stringify({ ...result, completed }, null, 2));
    for (const folder of generated) {
      for (const name of Object.keys(modules)) {
        const path = folder + "/" + name + ".ts";
        if (existsSync(path)) unlinkSync(path);
      }
      rmdirSync(folder);
    }
  }
}



