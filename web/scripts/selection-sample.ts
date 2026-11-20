import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { metrics } from "./selection-timing";

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:performance.db");
  assert.equal(process.env.DATABASE_AUTH_TOKEN, "");
  const { db } = await import("@/db/client");
  try {
    const { runSelection } = await import(process.argv[2]);
    const { appUser, promotionCandidate, processHistory } = await import("@/db/schema");
    const { and, desc, eq } = await import("drizzle-orm");
    const [hr] = await db.select().from(appUser).where(eq(appUser.userId, "hr01"));
    assert(hr?.role === "HR" && hr.empNo === null);
    const start = performance.now();
    const summary = await runSelection({ ...hr, role: "HR" }, 2);
    const ms = performance.now() - start;
    const candidates = await db.select().from(promotionCandidate)
      .where(eq(promotionCandidate.roundId, 2)).orderBy(promotionCandidate.empNo);
    const [history] = await db.select().from(processHistory)
      .where(and(eq(processHistory.entityId, "2"), eq(processHistory.action, "SELECTION_RUN")))
      .orderBy(desc(processHistory.histId)).limit(1);
    assert(history?.detailJson);
    assert.equal(candidates.length, summary.total);
    const digest = createHash("sha256").update(JSON.stringify({
      summary,
      candidates: candidates.map(({ judgedAt: _timestamp, ...candidate }) => candidate),
      detail: JSON.parse(history.detailJson),
    })).digest("hex");
    console.log(JSON.stringify({ ms, metrics, summary, digest, historyBytes: Buffer.byteLength(history.detailJson) }));
  } finally {
    db.$client.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

