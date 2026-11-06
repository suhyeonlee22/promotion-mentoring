import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { initializePasswords } from "@/db/set-passwords";
import { appUser } from "@/db/schema";
import { login } from "@/services/auth";
import { getCurrentUser, requireRole, setCurrentUser } from "./session";
import { signSession, verifySession } from "./session-token";
import { switchUserAction } from "@/app/switch-user/actions";
import SwitchUserPage from "@/app/switch-user/page";
import { loginAction, logoutAction } from "@/app/login/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const cookie = vi.hoisted(() => ({ value: "", set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookie.value ? { value: cookie.value } : undefined, set: cookie.set, delete: cookie.delete }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.clearAllMocks(); cookie.value = ""; await seedAll();
});
afterEach(() => vi.unstubAllEnvs());
it("모든 시드 비밀번호는 bcrypt 해시이며 환경변수 비밀번호로 검증", async () => {
  const users = await db.select().from(appUser);
  expect(users).toHaveLength(14);
  expect(users.every((u) => u.passwordHash?.startsWith("$2"))).toBe(true);
  expect(await compare(process.env.SEED_PASSWORD!, users[0].passwordHash!)).toBe(true);
});
it("로그인 성공: 서명 쿠키 생성, 쿠키 검증 후 기존 사용자·역할 조회", async () => {
  await login("hr01", process.env.SEED_PASSWORD!);
  const [name, token, options] = cookie.set.mock.calls[0];
  expect(name).toBe("uid"); expect(token).not.toBe("hr01");
  expect(verifySession(token, process.env.SESSION_SECRET!)).toBe("hr01");
  expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
  cookie.value = token;
  expect(await getCurrentUser()).toMatchObject({ userId: "hr01", role: "HR" });
});
it("잘못된 비밀번호·없는 사용자·비밀번호 없는 사용자는 동일 오류, 쿠키 발급 없음", async () => {
  for (const [id, password] of [["hr01", "invalid"], ["missing", process.env.SEED_PASSWORD!], ["hr01", ""]]) {
    await expect(login(id, password)).rejects.toThrow("아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  await db.update(appUser).set({ passwordHash: null }).where(eq(appUser.userId, "hr01"));
  await expect(login("hr01", process.env.SEED_PASSWORD!)).rejects.toThrow("아이디 또는 비밀번호가 올바르지 않습니다.");
  expect(cookie.set).not.toHaveBeenCalled();
});
it("위조·손상·서명 없는 쿠키 및 사라진 사용자 거부", async () => {
  const token = signSession("u1001", process.env.SESSION_SECRET!);
  for (const bad of ["hr01", token.replace("u1001", "hr01"), `${token}x`, "hr01.bad", signSession("missing", process.env.SESSION_SECRET!), signSession("hr01", "wrong-key")]) {
    cookie.value = bad; expect(await getCurrentUser()).toBeNull();
  }
});
it("서명 검증 후 역할 검사, 개발용 전환도 서명 쿠키 사용", async () => {
  await setCurrentUser("u1001"); cookie.value = cookie.set.mock.calls[0][1];
  expect(await requireRole("EMPLOYEE")).toMatchObject({ empNo: "U1001" });
  await expect(requireRole("HR")).rejects.toThrow("REDIRECT:/login");
});
it("production 쿠키 Secure, 서명 키 미설정 시 발급 거부 및 기존 토큰 거부", async () => {
  vi.stubEnv("NODE_ENV", "production"); await setCurrentUser("hr01");
  expect(cookie.set.mock.calls[0][2].secure).toBe(true);
  cookie.value = cookie.set.mock.calls[0][1]; cookie.set.mockClear();
  vi.stubEnv("SESSION_SECRET", "");
  expect(await getCurrentUser()).toBeNull();
  await expect(setCurrentUser("hr01")).rejects.toThrow("로그인 설정");
  expect(cookie.set).not.toHaveBeenCalled();
});
it("시드 비밀번호 미설정이면 기존 데이터 삭제 전에 실패", async () => {
  vi.stubEnv("SEED_PASSWORD", "");
  await expect(seedAll()).rejects.toThrow("SEED_PASSWORD");
  expect(await db.select().from(appUser)).toHaveLength(14);
});
it("production에서는 사용자 전환 페이지와 액션 모두 차단", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(SwitchUserPage()).rejects.toThrow("NOT_FOUND");
  await expect(switchUserAction("hr01")).rejects.toThrow("NOT_FOUND");
  expect(cookie.set).not.toHaveBeenCalled();
});
it("개발 전환 액션은 기존처럼 전환 후 홈으로 이동하고 서명 쿠키 사용", async () => {
  vi.stubEnv("NODE_ENV", "development");
  await expect(switchUserAction("u1001")).rejects.toThrow("REDIRECT:/");
  expect(verifySession(cookie.set.mock.calls[0][1], process.env.SESSION_SECRET!)).toBe("u1001");
});
it("로그인·로그아웃 액션의 성공 이동과 쿠키 삭제", async () => {
  const data = new FormData(); data.set("userId", "hr01"); data.set("password", process.env.SEED_PASSWORD!);
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/");
  expect(cookie.set).toHaveBeenCalledTimes(1);
  await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");
  expect(cookie.delete).toHaveBeenCalledWith("uid");
});
it("로그인 실패는 기존 오류 화면 이동, 쿠키 발급 없음", async () => {
  const data = new FormData(); data.set("userId", "hr01"); data.set("password", "invalid");
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/login?error=");
  expect(cookie.set).not.toHaveBeenCalled();
});
it("기존 DB는 비밀번호 미설정 계정만 초기화하고 기존 계정·해시는 보존", async () => {
  const before = await db.select().from(appUser);
  await db.update(appUser).set({ passwordHash: null }).where(eq(appUser.userId, "hr01"));
  expect(await initializePasswords()).toBe(1);
  expect(await initializePasswords()).toBe(0);
  const after = await db.select().from(appUser);
  expect(after).toHaveLength(before.length);
  expect(after.find((u) => u.userId === "u1001")).toEqual(before.find((u) => u.userId === "u1001"));
  expect(await compare(process.env.SEED_PASSWORD!, after.find((u) => u.userId === "hr01")!.passwordHash!)).toBe(true);
});
it.each(["기호 포함", "앞뒤 공백 포함"])("로그인 FormData의 %s 비밀번호를 변형 없이 비교하고 일부 누락은 거부", async (kind) => {
  // 실제 .env 비밀값 대신 실행마다 새로 만드는 테스트 전용 비밀번호.
  const generated = randomBytes(16).toString("hex") + "=/+";
  const password = kind === "앞뒤 공백 포함" ? ` ${generated} ` : generated;
  const passwordHash = await hash(password, 10);
  await db.update(appUser).set({ passwordHash }).where(eq(appUser.userId, "hr01"));
  const data = new FormData(); data.set("userId", "hr01"); data.set("password", password);
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/");
  expect(cookie.set).toHaveBeenCalledTimes(1);
  expect(verifySession(cookie.set.mock.calls[0][1], process.env.SESSION_SECRET!)).toBe("hr01");
  cookie.set.mockClear();
  data.set("password", password.slice(1));
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/login?error=");
  expect(cookie.set).not.toHaveBeenCalled();
});
