import type { Tx } from "./history";
import { mailOutbox } from "@/db/schema";
import { MAIL_TYPES } from "./codes";

export async function queueMail(
  tx: Tx,
  m: {
    dedupKey: string;
    mailType: keyof typeof MAIL_TYPES;
    toEmpNo: string;
    toEmail: string;
    subject: string;
    body: string;
  },
): Promise<boolean> {
  const result = await tx
    .insert(mailOutbox) // 메일 저장
    .values({
      ...m,
      createdAt: new Date().toISOString(),
    })
    // 중복 키가 있으면 저장 생략
    .onConflictDoNothing({
      target: mailOutbox.dedupKey,
    })

    // 실제로 저장됐는지 확인
    .returning({
      mailId: mailOutbox.mailId,
    });

  return result.length > 0;
}
