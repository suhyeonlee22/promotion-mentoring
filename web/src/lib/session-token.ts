import { createHmac, timingSafeEqual } from "node:crypto";

export function signSession(userId: string, secret: string): string {
  if (!secret) throw new Error("SESSION_SECRET이 필요합니다.");
  const signature = createHmac("sha256", secret).update(userId).digest("hex");
  return `${userId}.${signature}`;
}
export function verifySession(token: string, secret: string): string | null {
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const expected = signSession(parts[0], secret).split(".")[1];
  return timingSafeEqual(Buffer.from(parts[1], "hex"), Buffer.from(expected, "hex")) ? parts[0] : null;
}
