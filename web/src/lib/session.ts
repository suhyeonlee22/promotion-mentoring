
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { appUser } from "@/db/schema";

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
  const uid = (await cookies()).get(COOKIE)?.value;

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

  (await cookies()).set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

// 역할별 접근 권한 검사
export async function requireRole(
  role: CurrentUser["role"]
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== role) {
    redirect("/switch-user");
  }

  return user;
}
