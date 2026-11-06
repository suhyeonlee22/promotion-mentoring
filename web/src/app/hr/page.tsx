import Link from "next/link";
import { desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { application, appUser, correctionRequest, promotionRound, stepSchedule, processHistory } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { APP_STATUS, COMPARE_STATUS, ROUND_STATUS } from "@/lib/codes";
import { Badge, EmptyState, LinkButton, Panel, StatCard } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

const actionLabels: Record<string, string> = {
  ROUND_CREATED: "회차 생성", ROUND_STATUS_CHANGED: "회차 상태 변경", SELECTION_RUN: "대상자 선정",
  MANUAL_ADD: "대상자 추가", MANUAL_EXCLUDE: "대상자 제외", MANUAL_CANCEL: "예외 처리 취소",
  APP_CREATED: "신청서 생성", APP_DRAFTED: "신청서 작성", APP_SUBMITTED: "신청서 제출", APP_RETURNED: "보완 요청", APP_CONFIRMED: "신청서 확정",
  CORRECTION_REQUESTED: "정정 요청", CORRECTION_APPROVED: "정정 승인", CORRECTION_REJECTED: "정정 반려",
  RESULT_REGISTERED: "결과 등록", RESULT_NOTIFIED: "결과 안내", STEP_CALCULATED: "승급일 산정", STEP_CONFIRMED: "승급일 확정", STEP_REVIEW_NEEDED: "승급일 재확인", SETTING_UPDATED: "기준정보 변경",
};
function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
const percent = (count: number, total: number) => total > 0 ? Math.round(count / total * 1000) / 10 : 0;

export default async function HrPage() {
  await requireRole("HR");
  // 기존 진행 회차 정의와 각 상태별 집계를 그대로 사용한다.
  const rounds = await db.select().from(promotionRound).where(ne(promotionRound.status, "RESULT")).orderBy(promotionRound.roundId);
  const counts = await db.select({ roundId: application.roundId, status: application.status, count: sql<number>`count(*)` }).from(application).groupBy(application.roundId, application.status);
  const [pending] = await db.select({ count: sql<number>`count(*)` }).from(correctionRequest).where(eq(correctionRequest.status, "PENDING"));
  const comparisons = await db.select({ status: stepSchedule.compareStatus, count: sql<number>`count(*)` }).from(stepSchedule).groupBy(stepSchedule.compareStatus);
  const [steps] = await db.select({
    managed: sql<number>`coalesce(sum(case when ${stepSchedule.calcStatus} <> 'EXCLUDED' then 1 else 0 end), 0)`,
    calculated: sql<number>`coalesce(sum(case when ${stepSchedule.calcStatus} = 'OK' then 1 else 0 end), 0)`,
    confirmed: sql<number>`coalesce(sum(case when ${stepSchedule.calcStatus} <> 'EXCLUDED' and ${stepSchedule.confirmedDate} is not null and ${stepSchedule.reviewNeeded} <> 'Y' then 1 else 0 end), 0)`,
    reviewManaged: sql<number>`coalesce(sum(case when ${stepSchedule.calcStatus} <> 'EXCLUDED' and ${stepSchedule.reviewNeeded} = 'Y' then 1 else 0 end), 0)`,
    reviewAll: sql<number>`coalesce(sum(case when ${stepSchedule.reviewNeeded} = 'Y' then 1 else 0 end), 0)`,
    calculatedAt: sql<string | null>`max(${stepSchedule.calculatedAt})`,
  }).from(stepSchedule);
  const recent = await db.select({ histId: processHistory.histId, action: processHistory.action, actor: processHistory.actor, actorName: appUser.name, entityType: processHistory.entityType, entityId: processHistory.entityId, actedAt: processHistory.actedAt })
    .from(processHistory).leftJoin(appUser, eq(processHistory.actor, appUser.userId)).orderBy(desc(processHistory.actedAt), desc(processHistory.histId)).limit(5);
  const activeIds = new Set(rounds.map((r) => r.roundId));
  const activeCount = (status: string) => counts.filter((c) => activeIds.has(c.roundId) && c.status === status).reduce((total, c) => total + c.count, 0);
  const unfinished = steps.managed - steps.confirmed - steps.reviewManaged;
  const distribution = [
    { key: "confirmed", label: "확정 완료", count: steps.confirmed },
    { key: "pending", label: "확정 전", count: unfinished },
    { key: "review", label: "재확인 필요", count: steps.reviewManaged },
  ];
  return <main className="dashboard">
    <div className="dashboard-hero"><div><h1>인사관리 대시보드</h1><p>승진심사 및 차기승급 현황을 확인하고 주요 업무를 처리하세요.</p></div><div className="dashboard-hero__actions"><LinkButton href="/hr/steps"><Icon name="calendar"/>차기승급일 확인</LinkButton><LinkButton href="/hr/rounds" variant="primary"><Icon name="clipboard"/>회차별 신청서 검토</LinkButton></div></div>
    <div className="dashboard-stats">
      <StatCard title="진행 중인 승진심사" value={rounds.length} unit="건" icon="award" note="준비 · 신청 · 검토 회차" badge="진행 현황"/>
      <StatCard title="검토 대기 신청서" value={activeCount("SUBMITTED")} unit="건" icon="clipboard" note="진행 회차의 제출 신청서" badge="검토 대기"/>
      <StatCard title="보완 요청 건수" value={activeCount("RETURNED")} unit="건" icon="alert" note="보완 후 재제출 대상" badge="보완 요청" danger/>
      <StatCard title="차기승급 재확인 필요" value={steps.reviewAll} unit="명" icon="history" note="자동 산정값 변경 감지" badge="재확인 관리"/>
    </div>
    <div className="dashboard-columns"><div className="dashboard-main">
      <Panel title="승진심사 진행 현황" actions={<Link href="/hr/rounds" prefetch={false} className="text-link">회차 관리 전체보기<Icon name="arrow" width={14} height={14}/></Link>}>
        {!rounds.length ? <EmptyState>진행 중 회차가 없습니다.</EmptyState> : <div className="dashboard-table-scroll" role="region" aria-label="진행 중 승진심사 목록" tabIndex={0}><table className="dashboard-table"><thead><tr><th scope="col">회차명</th><th scope="col">신청 기간</th><th scope="col">진행 상태</th><th scope="col">신청 인원</th><th scope="col">검토 대기</th><th scope="col">관리</th></tr></thead><tbody>
          {rounds.map((round) => {
            const own = counts.filter((c) => c.roundId === round.roundId);
            const total = own.reduce((n, c) => n + c.count, 0);
            return <tr key={round.roundId}><td className="dashboard-table__name"><span className="round-name">{round.name}</span><div className="round-status-counts">{Object.entries(APP_STATUS).map(([code, label]) => <span key={code}>{`${label}: ${own.find((c) => c.status === code)?.count ?? 0}명`}</span>)}</div></td><td className="dashboard-table__dates">{round.applyStart}<br/>~ {round.applyEnd}</td><td><Badge tone={round.status === "PREPARING" ? "neutral" : "info"}>{ROUND_STATUS[round.status as keyof typeof ROUND_STATUS] ?? round.status}</Badge></td><td>{total}명</td><td className={own.some((c) => c.status === "SUBMITTED" && c.count > 0) ? "dashboard-danger" : undefined}>{own.find((c) => c.status === "SUBMITTED")?.count ?? 0}건</td><td><LinkButton href={`/hr/rounds/${round.roundId}/applications`}>상세보기</LinkButton></td></tr>;
          })}
        </tbody></table></div>}
        <p className="dashboard-table__footer">진행 중 회차 {rounds.length}건 · 결과 단계 회차는 회차 관리에서 확인할 수 있습니다.</p>
      </Panel>
      <Panel title="차기승급일 관리 현황" actions={<Link href="/hr/steps" prefetch={false} className="text-link">승급 관리 및 재계산<Icon name="arrow" width={14} height={14}/></Link>}>
        <p className="dashboard-caption mb-4">{steps.calculatedAt ? <>최근 산정: <time dateTime={steps.calculatedAt}>{timeLabel(steps.calculatedAt)} KST</time></> : "저장된 산정 결과가 없습니다. 차기승급일 관리에서 재계산해 주세요."}</p>
        <div className="step-summary">
          {[{ title: "계산 완료 인원", count: steps.calculated, danger: false }, { title: "확정 완료 인원", count: steps.confirmed, danger: false }, { title: "재확인 필요 대상", count: steps.reviewManaged, danger: true }].map((item) => <div key={item.title} className={`step-summary__item${item.danger ? " step-summary__item--danger" : ""}`}><h3>{item.title}</h3><p className="step-summary__value">{item.count}<span> / {steps.managed}명</span></p><div className="mini-progress" aria-hidden="true"><span style={{ width: `${percent(item.count, steps.managed)}%` }}/></div><p className="dashboard-caption mt-2">{percent(item.count, steps.managed)}%</p></div>)}
        </div>
        <div className="distribution"><div className="distribution__heading"><h3>확정 및 재확인 현황</h3><span>관리 대상: {steps.managed}명</span></div><div className="distribution__bar" aria-hidden="true">{distribution.map((item) => <span key={item.key} className={`distribution__segment--${item.key}`} style={{ width: `${percent(item.count, steps.managed)}%` }}/>)}</div><div className="distribution__legend">{distribution.map((item) => <span key={item.key} data-step-state={item.key} data-count={item.count}><i className={`distribution__segment--${item.key}`} aria-hidden="true"/>{item.label} {item.count}명 ({percent(item.count, steps.managed)}%)</span>)}</div><p className="dashboard-caption mt-3">관리 제외 인원은 분모에서 제외하며, 확정 완료는 재확인 대상과 구분합니다.</p></div>
        <div className="compare-summary" aria-label="차기승급일 비교 상태별 인원">{Object.entries(COMPARE_STATUS).map(([code, label]) => <Link key={code} href={`/hr/steps?status=${code}`} prefetch={false} className="text-link">{`${label}: ${comparisons.find((c) => c.status === code)?.count ?? 0}명`}</Link>)}</div>
        <p className="dashboard-caption mt-3">{`재확인 필요: ${steps.reviewAll}명`}</p>
      </Panel>
    </div><div className="dashboard-aside">
      <Panel title="최근 처리 내역" actions={<Icon name="history"/>}>
        {!recent.length ? <EmptyState>처리 이력이 없습니다.</EmptyState> : <ol className="activity-list">{recent.map((item) => <li className="activity-item" key={item.histId}><div className="activity-item__heading"><Badge tone={["APP_RETURNED", "STEP_REVIEW_NEEDED"].includes(item.action) ? "danger" : "info"}>{actionLabels[item.action] ?? item.action}</Badge><time dateTime={item.actedAt}>{timeLabel(item.actedAt)} KST</time></div><p>{item.actorName ?? item.actor}</p><p>{item.entityType} · {item.entityId}</p></li>)}</ol>}
        <div className="activity-footer"><LinkButton href="/hr/history">이력 전체보기 (Audit Trail)<Icon name="chevron" width={14} height={14}/></LinkButton></div>
      </Panel>
      <Panel title="인사담당자 업무 안내" className="work-guidance" actions={<Icon name="alert"/>}>
        <ul><li><strong>{`처리 대기 정정 요청: ${pending.count}건`}</strong><br/>회차별 신청 현황에서 요청 내용을 확인하고 처리할 수 있습니다.</li><li><strong>{`차기승급 재확인 대상: ${steps.reviewAll}명`}</strong><br/>계산 근거를 확인한 후 차기승급일을 다시 확정해 주세요.</li><li><strong>승급 정보 관리</strong><br/>ERP 변경 사항은 차기승급일 재계산 후 비교 상태와 처리 이력으로 확인할 수 있습니다.</li></ul>
        <LinkButton href="/hr/notifications">알림함 확인<Icon name="arrow" width={14} height={14}/></LinkButton>
      </Panel>
    </div></div>
  </main>;
}
