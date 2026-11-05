"use client";

import { useActionState } from "react";
import { saveDraftAction, submitApplicationAction, type SubmissionState } from "./actions";

export default function ApplicationForm({ appId, initialState }: {
  appId: number;
  initialState: SubmissionState;
}) {
  const [state, submit, pending] = useActionState(submitApplicationAction, initialState);

  return <form action={submit} className="space-y-4">
    <input type="hidden" name="appId" value={appId}/>
    {state.error && <p role="alert" className="text-red-600">{state.error}</p>}
    <div>
      <label htmlFor="achievement" className="mb-2 block font-medium">주요 업무실적 (최대 2,000자)</label>
      <textarea id="achievement" name="achievement" maxLength={2000}
        defaultValue={state.achievement} rows={6} className="w-full rounded border p-3"
        placeholder="주요 업무실적을 입력하세요."/>
    </div>
    <div>
      <label htmlFor="plan" className="mb-2 block font-medium">자기개발 계획 (최대 1,000자)</label>
      <textarea id="plan" name="plan" maxLength={1000}
        defaultValue={state.plan} rows={4} className="w-full rounded border p-3"
        placeholder="자기개발 계획을 입력하세요."/>
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="submit" formAction={saveDraftAction} disabled={pending} className="rounded border px-5 py-3">임시저장</button>
      <button type="submit" disabled={pending} className="rounded bg-blue-600 px-5 py-3 text-white">최종 제출</button>
    </div>
  </form>;
}
