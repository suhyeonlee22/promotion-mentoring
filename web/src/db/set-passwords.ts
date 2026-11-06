import "dotenv/config";
import { hash } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { appUser } from "./schema";

/** 기존 업무 데이터와 이미 설정된 비밀번호를 보존하는 P1→P2 초기화. */
export async function initializePasswords(): Promise<number> {
  const password = process.env.SEED_PASSWORD;
  if (!password || Buffer.byteLength(password, "utf8") > 72) throw new Error("SEED_PASSWORD를 비어 있지 않은 72바이트 이하 환경변수로 설정해 주세요.");
  const passwordHash = await hash(password, 10);
  return db.transaction(async (tx) => {
    const missing = await tx.select({ userId: appUser.userId }).from(appUser).where(isNull(appUser.passwordHash));
    let count = 0;
    for (const user of missing) {
      const changed = await tx.update(appUser).set({ passwordHash }).where(and(eq(appUser.userId, user.userId), isNull(appUser.passwordHash))).returning({ userId: appUser.userId });
      count += changed.length;
    }
    return count;
  });
}
if (process.argv[1]?.endsWith("set-passwords.ts")) {
  initializePasswords().then((count) => console.log(`비밀번호 초기화: ${count}계정`)).catch((error) => { console.error(error); process.exit(1); });
}
