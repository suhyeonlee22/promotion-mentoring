
import { GRADES } from "./codes";

/**
 * 직급 코드를 한글 명칭으로 변환
 * 예: G6 → 6급
 */
export function gradeLabel(code: string): string {
  const grade = GRADES.find((g) => g.code === code);
  return grade?.label ?? code;
}

/**
 * 상태 코드를 한글 명칭으로 변환
 * 예: DRAFT → 작성 중
 */
export function statusLabel(
  map: Record<string, string>,
  code: string | null,
): string {
  if (code === null) return "-";
  return map[code] ?? code;
}

/**
 * 전화번호 가운데 자리 마스킹
 * 예: 010-2001-1001 → 010-****-1001
 */
export function maskPhone(phone: string): string {
  return phone.replace(
    /^(\d{2,3})-(\d{3,4})-(\d{4})$/,
    (_, first, middle, last) =>
      `${first}-${"*".repeat(middle.length)}-${last}`,
  );
}

/**
 * 값이 없으면 '-' 표시
 * 숫자 0은 정상적인 값으로 취급
 */
export function orDash(
  v: string | number | null | undefined,
): string {
  if (v === null || v === undefined || v === "") {
    return "-";
  }

  return String(v);
}
