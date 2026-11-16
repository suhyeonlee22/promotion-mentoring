import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { appUser, appSession } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "./session-token";

const COOKIE = "uid";
// 로그인 후 8시간 동안 세션 유지
const SESSION_MAX_AGE = 60 * 60 * 8;

// README B-1: 현재 사용자 타입
export type CurrentUser = {
  userId: string;
  name: string;
  role: "HR" | "EMPLOYEE" | "REVIEWER";
  empNo: string | null;
};

// 현재 사용자 조회

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 1. 브라우저 쿠키에서 세션 토큰 가져오기
  const token = (await cookies()).get(COOKIE)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  // 2. 토큰을 해시해 DB에서 세션 조회
  const tokenHash = hashSessionToken(token);

  const [session] = await db
    .select()
    .from(appSession)
    .where(eq(appSession.tokenHash, tokenHash));

  if (!session) {
    return null;
  }

  // 3. 세션 만료 여부 확인
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  // 4. 세션에 연결된 사용자 조회
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, session.userId));

  if (!user) {
    return null;
  }

  // 5. 올바른 사용자 역할인지 확인
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
export async function setCurrentUser(userId: string): Promise<void> {
  // 1. 로그인할 사용자가 존재하는지 확인
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, userId));

  if (!user) {
    throw new Error("존재하지 않는 사용자입니다.");
  }

  // 2. 무작위 세션 토큰 생성
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  // 3. 세션 발급 시각과 만료 시각 계산
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE * 1000);

  // 4. DB에 세션 저장
  await db.insert(appSession).values({
    tokenHash,
    userId: user.userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  // 5. 브라우저에 원본 토큰 저장
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;

  // 정상적인 토큰 형식일 때만 DB 세션 삭제
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = hashSessionToken(token);

    await db.delete(appSession).where(eq(appSession.tokenHash, tokenHash));
  }

  // 브라우저에 저장된 쿠키도 삭제
  cookieStore.delete(COOKIE);
}

// 역할별 접근 권한 검사
export async function requireRole(
  role: CurrentUser["role"],
): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user || user.role !== role) {
    redirect("/login");
  }

  return user;
}
