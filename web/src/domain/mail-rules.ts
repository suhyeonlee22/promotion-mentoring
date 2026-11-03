// 날짜가 메일 발송 대상 기간에 포함되는지 확인
import { addDays } from "./date";

// 오늘 다음 날부터 30일 이내 예정자
export function isStepNoticeTarget(
  confirmedDate: string | null,
  today: string,
  days: number,
): boolean {
  if (confirmedDate === null) return false;

  const endDate = addDays(today, days);

  return confirmedDate > today && confirmedDate <= endDate;
}

// 오늘을 포함해 과거 30일 이내 승급 발령자
export function isStepResultTarget(
  apptDate: string,
  today: string,
  days: number,
): boolean {
  const startDate = addDays(today, -days);

  return apptDate >= startDate && apptDate <= today;
}
