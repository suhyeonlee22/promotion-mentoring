
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { appUser } from "@/db/schema";
import { signSession, verifySession } from "./session-token";
import { BusinessError } from "./error";

const COOKIE = "uid";

// README B-1: 현재 사용자 타입
export type CurrentUser = {
  userId: string;
  name: string;
  role: "HR" | "EMPLOYEE" | "REVIEWER";
  empNo: string | null;
};

// 현재 사용자 조회
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const uid = token ? verifySession(token, process.env.SESSION_SECRET ?? "") : null;

  if (!uid) return null;

  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, uid));

  if (!user) return null;

  if (
    user.role !== "HR" &&
    user.role !== "EMPLOYEE" &&
    user.role !== "REVIEWER"
  ) {
    throw new Error("올바르지 않은 사용자 역할입니다.");
  }

  return {
    userId: user.userId,
    name: user.name,
    role: user.role,
    empNo: user.empNo,
  };
}

// 사용자 전환
// Server Action 또는 Route Handler에서 호출
export async function setCurrentUser(
  userId: string
): Promise<void> {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, userId));

  if (!user) {
    throw new Error("존재하지 않는 사용자입니다.");
  }

  if (!process.env.SESSION_SECRET) throw new BusinessError("SESSION_CONFIG", "로그인 설정을 확인해 주세요.");
  (await cookies()).set(COOKIE, signSession(userId, process.env.SESSION_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

// 역할별 접근 권한 검사
export async function requireRole(
  role: CurrentUser["role"]
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== role) {
    redirect("/login");
  }

  return user;
}
