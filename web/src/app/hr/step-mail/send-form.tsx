"use client";
import { useActionState } from "react";
import { sendStepMailsAction } from "./actions";

export default function SendForm({ defaultToday }: { defaultToday: string }) {
  const [state, action, pending] = useActionState(sendStepMailsAction, { today: defaultToday, error: "", mails: [], ran: false });
  return <div className="space-y-5"><form action={action} className="flex flex-wrap items-center gap-4">
    <label>기준일 <input type="date" name="today" defaultValue={defaultToday} className="rounded border p-2"/></label>
    <button disabled={pending} className="rounded border px-4 py-2 disabled:opacity-40">{pending ? "처리 중…" : "승급 안내 발송"}</button>
  </form>
    {state.error && <p role="alert">{state.error}</p>}
    {state.ran && <section className="space-y-3"><h2 className="text-xl font-semibold">이번 실행에서 생성된 메일</h2><p role="status">기준일 {state.today} · 새 메일 {state.mails.length}건</p>
      {!state.mails.length && <p>새로 생성된 메일이 없습니다.</p>}
      {state.mails.map((mail) => <details key={mail.mailId} className="rounded border p-4"><summary>{mail.subject} · {mail.toEmpNo}</summary><p>{mail.toEmail}</p><p className="whitespace-pre-wrap">{mail.body}</p></details>)}
    </section>}
  </div>;
}
