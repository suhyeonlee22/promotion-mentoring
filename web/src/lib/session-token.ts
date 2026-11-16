import { createHash, randomBytes } from "node:crypto";

// 로그인할 때마다 예측하기 어려운 새 토큰 발급
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// DB에는 토큰 원문이 아니라 해시값 저장
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
