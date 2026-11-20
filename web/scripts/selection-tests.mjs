import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { acquireSelectionLock } from "./selection-lock.mjs";

assert.equal(process.env.DATABASE_URL, "file:performance.db");
assert.equal(process.env.DATABASE_AUTH_TOKEN, "");
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const release = acquireSelectionLock();
try {
  mkdirSync("backups", { recursive: true });
  const dir = mkdtempSync("backups/selection-test-");
  const snapshot = dir + "/original.db";
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    assert.equal(existsSync("performance.db" + suffix), suffix === "");
  }
  copyFileSync("performance.db", snapshot);
  try {
    const options = { stdio: "inherit", env: { ...process.env, DOTENV_CONFIG_PATH: ".env.test" } };
    // The benchmark fixture can predate tables required by the full test suite.
    writeFileSync("performance.db", "");
    await import("./selection-imports.mjs");
    const { pushSQLiteSchema } = await import("drizzle-kit/api");
    const schema = await import("../src/db/schema.ts");
    const { db } = await import("../src/db/client.ts");
    try {
      const migration = await pushSQLiteSchema(schema, db);
      await migration.apply();
    } finally {
      db.$client.close();
    }
    const result = spawnSync(process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--config", "scripts/selection-vitest.config.mts"],
      options);
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    for (const suffix of ["-wal", "-shm", "-journal"]) assert(!existsSync("performance.db" + suffix));
    copyFileSync(snapshot, "performance.db");
    assert(readFileSync(snapshot).equals(readFileSync("performance.db")));
  }
} finally {
  release();
}
