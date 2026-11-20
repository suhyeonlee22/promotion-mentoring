import { mkdirSync, rmdirSync } from "node:fs";

export function acquireSelectionLock() {
  const lock = "performance.db.selection-lock";
  mkdirSync(lock);
  return () => rmdirSync(lock);
}
