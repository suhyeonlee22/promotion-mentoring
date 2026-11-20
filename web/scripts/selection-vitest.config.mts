import assert from "node:assert/strict";
import { defineConfig } from "vitest/config";
import config from "../vitest.config.mjs";

assert.equal(process.env.DATABASE_URL, "file:performance.db");
assert.equal(process.env.DATABASE_AUTH_TOKEN, "");

// Existing tests also assert the database filename. Adapt those guards only in
// this run, while keeping the regular Vitest config and test files intact.
export default defineConfig({
  ...config,
  plugins: [{
    name: "selection-test-database",
    enforce: "pre",
    transform(code, id) {
      if (/\.int\.test\.tsx?$/.test(id)) {
        return code.replaceAll("file:test.db", "file:performance.db");
      }
    },
  }],
  test: {
    ...config.test,
    env: { ...config.test?.env, DATABASE_URL: "file:performance.db", DATABASE_AUTH_TOKEN: "" },
  },
});
