import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { initializePasswords } from "@/db/set-passwords";
import { appUser, appSession } from "@/db/schema";
import { login } from "@/services/auth";
import { getCurrentUser, requireRole, setCurrentUser } from "./session";
import { hashSessionToken } from "./session-token";
import { switchUserAction } from "@/app/switch-user/actions";
import SwitchUserPage from "@/app/switch-user/page";
import { loginAction, logoutAction } from "@/app/login/actions";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const cookie = vi.hoisted(() => ({ value: "", set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookie.value ? { value: cookie.value } : undefined),
    set: cookie.set,
    delete: cookie.delete,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db")
    throw new Error("테스트 전용 DB가 아닙니다.");
  vi.clearAllMocks();
  cookie.value = "";
  await seedAll();
});
afterEach(() => vi.unstubAllEnvs());
it("모든 시드 비밀번호는 bcrypt 해시이며 환경변수 비밀번호로 검증", async () => {
  const users = await db.select().from(appUser);
  expect(users).toHaveLength(14);
  expect(users.every((u) => u.passwordHash?.startsWith("$2"))).toBe(true);
  expect(
    await compare(process.env.SEED_PASSWORD!, users[0].passwordHash!),
  ).toBe(true);
});

it("로그인 성공: DB 세션 생성 및 사용자·역할 조회", async () => {
  await login("hr01", process.env.SEED_PASSWORD!);

  const [name, token, options] = cookie.set.mock.calls[0];

  // 쿠키에 무작위 토큰이 저장되는지 확인
  expect(name).toBe("uid");
  expect(token).toMatch(/^[a-f0-9]{64}$/);

  expect(options).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 8,
  });

  // 원본 토큰이 아니라 해시가 DB에 저장되는지 확인
  const [session] = await db
    .select()
    .from(appSession)
    .where(eq(appSession.tokenHash, hashSessionToken(token)));

  expect(session).toBeDefined();
  expect(session.userId).toBe("hr01");
  expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

  // 쿠키를 이용해 로그인된 사용자 조회
  cookie.value = token;

  expect(await getCurrentUser()).toMatchObject({
    userId: "hr01",
    role: "HR",
  });
});

it("잘못된 비밀번호·없는 사용자·비밀번호 없는 사용자는 동일 오류, 쿠키 발급 없음", async () => {
  for (const [id, password] of [
    ["hr01", "invalid"],
    ["missing", process.env.SEED_PASSWORD!],
    ["hr01", ""],
  ]) {
    await expect(login(id, password)).rejects.toThrow(
      "아이디 또는 비밀번호가 올바르지 않습니다.",
    );
  }
  await db
    .update(appUser)
    .set({ passwordHash: null })
    .where(eq(appUser.userId, "hr01"));
  await expect(login("hr01", process.env.SEED_PASSWORD!)).rejects.toThrow(
    "아이디 또는 비밀번호가 올바르지 않습니다.",
  );
  expect(cookie.set).not.toHaveBeenCalled();
});

it("위조·변조·존재하지 않는 세션 토큰 거부", async () => {
  // 정상적인 DB 세션 생성
  await setCurrentUser("u1001");
  const validToken = cookie.set.mock.calls[0][1];

  // 정상 토큰은 인증 성공
  cookie.value = validToken;
  expect(await getCurrentUser()).toMatchObject({
    userId: "u1001",
    role: "EMPLOYEE",
  });

  // 다양한 잘못된 토큰은 인증 거부
  const invalidTokens = [
    "u1001", // 사용자 ID 직접 입력
    validToken.slice(0, -1), // 길이가 잘못된 토큰
    `${validToken}x`, // 불필요한 문자 추가
    "a".repeat(64) === validToken ? "b".repeat(64) : "a".repeat(64), // 형식은 정상이나 DB에 없는 토큰
    validToken.slice(0, -1) + (validToken.at(-1) === "a" ? "b" : "a"), // 실제 토큰 한 글자 변조
  ];

  for (const token of invalidTokens) {
    cookie.value = token;
    expect(await getCurrentUser()).toBeNull();
  }
});

it("DB 세션 기반 역할 검사 및 개발용 사용자 전환", async () => {
  await setCurrentUser("u1001");
  cookie.value = cookie.set.mock.calls[0][1];
  expect(await requireRole("EMPLOYEE")).toMatchObject({ empNo: "U1001" });
  await expect(requireRole("HR")).rejects.toThrow("REDIRECT:/login");
});

it("production 쿠키 Secure 및 만료된 DB 세션 거부", async () => {
  vi.stubEnv("NODE_ENV", "production");

  await setCurrentUser("hr01");

  const [name, token, options] = cookie.set.mock.calls[0];

  expect(name).toBe("uid");
  expect(options.secure).toBe(true);

  // 정상 세션은 사용자 조회 가능
  cookie.value = token;
  expect(await getCurrentUser()).toMatchObject({
    userId: "hr01",
    role: "HR",
  });

  // DB에 저장된 세션을 강제로 만료 처리
  await db
    .update(appSession)
    .set({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    .where(eq(appSession.tokenHash, hashSessionToken(token)));

  // 쿠키가 남아 있어도 만료된 세션은 거부
  expect(await getCurrentUser()).toBeNull();
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

it("개발 전환 액션은 새 DB 세션을 생성하고 홈으로 이동", async () => {
  vi.stubEnv("NODE_ENV", "development");

  await expect(switchUserAction("u1001")).rejects.toThrow("REDIRECT:/");

  // 새로 발급한 토큰을 테스트용 쿠키에 설정
  const token = cookie.set.mock.calls[0][1];
  expect(token).toMatch(/^[a-f0-9]{64}$/);

  cookie.value = token;

  // 실제 DB 세션을 통해 사용자 확인
  expect(await getCurrentUser()).toMatchObject({
    userId: "u1001",
    role: "EMPLOYEE",
  });
});

it("로그인·로그아웃 액션의 성공 이동과 DB 세션 삭제", async () => {
  const data = new FormData();
  data.set("userId", "hr01");
  data.set("password", process.env.SEED_PASSWORD!);

  // 1. 로그인
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/");

  expect(cookie.set).toHaveBeenCalledTimes(1);

  const token = cookie.set.mock.calls[0][1];
  const tokenHash = hashSessionToken(token);

  // 테스트용 브라우저에 로그인 쿠키 설정
  cookie.value = token;

  // 2. 로그아웃 전: 세션이 유효한지 확인
  expect(await getCurrentUser()).toMatchObject({
    userId: "hr01",
  });

  // 3. 로그아웃
  await expect(logoutAction()).rejects.toThrow("REDIRECT:/login");

  expect(cookie.delete).toHaveBeenCalledWith("uid");

  // 4. 로그아웃 후: DB 세션이 삭제됐는지 확인
  const sessions = await db
    .select()
    .from(appSession)
    .where(eq(appSession.tokenHash, tokenHash));

  expect(sessions).toHaveLength(0);

  // 5. 이전 토큰을 다시 사용해도 인증 거부
  expect(await getCurrentUser()).toBeNull();
});

it("로그인 실패는 기존 오류 화면 이동, 쿠키 발급 없음", async () => {
  const data = new FormData();
  data.set("userId", "hr01");
  data.set("password", "invalid");
  await expect(loginAction(data)).rejects.toThrow("REDIRECT:/login?error=");
  expect(cookie.set).not.toHaveBeenCalled();
});
it("기존 DB는 비밀번호 미설정 계정만 초기화하고 기존 계정·해시는 보존", async () => {
  const before = await db.select().from(appUser);
  await db
    .update(appUser)
    .set({ passwordHash: null })
    .where(eq(appUser.userId, "hr01"));
  expect(await initializePasswords()).toBe(1);
  expect(await initializePasswords()).toBe(0);
  const after = await db.select().from(appUser);
  expect(after).toHaveLength(before.length);
  expect(after.find((u) => u.userId === "u1001")).toEqual(
    before.find((u) => u.userId === "u1001"),
  );
  expect(
    await compare(
      process.env.SEED_PASSWORD!,
      after.find((u) => u.userId === "hr01")!.passwordHash!,
    ),
  ).toBe(true);
});
it.each(["기호 포함", "앞뒤 공백 포함"])(
  "로그인 FormData의 %s 비밀번호를 변형 없이 비교하고 일부 누락은 거부",
  async (kind) => {
    // 실제 .env 비밀값 대신 실행마다 새로 만드는 테스트 전용 비밀번호.
    const generated = randomBytes(16).toString("hex") + "=/+";
    const password = kind === "앞뒤 공백 포함" ? ` ${generated} ` : generated;
    const passwordHash = await hash(password, 10);
    await db
      .update(appUser)
      .set({ passwordHash })
      .where(eq(appUser.userId, "hr01"));
    const data = new FormData();
    data.set("userId", "hr01");
    data.set("password", password);
    await expect(loginAction(data)).rejects.toThrow("REDIRECT:/");
    expect(cookie.set).toHaveBeenCalledTimes(1);
    // 발급된 쿠키로 실제 로그인 사용자 확인
    cookie.value = cookie.set.mock.calls[0][1];

    expect(await getCurrentUser()).toMatchObject({
      userId: "hr01",
      role: "HR",
    });
    cookie.set.mockClear();
    data.set("password", password.slice(1));
    await expect(loginAction(data)).rejects.toThrow("REDIRECT:/login?error=");
    expect(cookie.set).not.toHaveBeenCalled();
  },
);
