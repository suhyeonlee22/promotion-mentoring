import { addDays } from "@/domain/date";

export type LogQuery = Record<string, string | string[] | undefined>;
export function queryText(query: LogQuery, key: string): string {
  return typeof query[key] === "string" ? query[key].trim() : "";
}

/** 기록 시각은 ISO UTC로 저장한다. 종료일을 포함하는 날짜 필터. */
export function logPeriod(query: LogQuery) {
  const from = queryText(query, "from");
  const to = queryText(query, "to");
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
  const error = (from && !valid(from)) || (to && !valid(to))
    ? "올바른 조회 날짜를 입력해 주세요."
    : from && to && from > to ? "시작일은 종료일보다 늦을 수 없습니다." : "";
  return { from, to, error, start: from ? `${from}T00:00:00` : "", end: to && !error ? `${addDays(to, 1)}T00:00:00` : "" };
}
