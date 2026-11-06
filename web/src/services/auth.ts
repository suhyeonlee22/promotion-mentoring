import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appUser } from "@/db/schema";
import { BusinessError } from "@/lib/error";
import { setCurrentUser } from "@/lib/session";

export async function login(userId: string, password: string): Promise<void> {
  if (!userId.trim() || !password || Buffer.byteLength(password, "utf8") > 72) throw new BusinessError("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  const [user] = await db.select().from(appUser).where(eq(appUser.userId, userId.trim()));
  if (!user?.passwordHash || !(await compare(password, user.passwordHash))) throw new BusinessError("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  await setCurrentUser(user.userId);
}
