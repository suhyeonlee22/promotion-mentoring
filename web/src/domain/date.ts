// 'YYYY-MM-DD' 형식 날짜 계산.
// 시간대 때문에 날짜가 하루 밀리는 문제를 피하려고 내부에서는 UTC만 쓴다.
// 날짜 문자열은 형식이 같으므로 크기 비교는 문자열 비교(<, <=)로 하면 된다.

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** n일 뒤 (n은 음수 가능). addDays('2026-07-01', 184) → '2027-01-01' */
export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY_MS);
}

/**
 * n개월 뒤 (n은 음수 가능). 같은 날짜가 없으면 그 달의 마지막 날.
 * addMonths('2026-03-31', 18) → '2027-09-30'
 */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** from부터 to까지의 일수 (양 끝 포함). to가 from보다 앞이면 0. ('2024-03-01', '2024-08-31') → 184 */
export function daysInclusive(from: string, to: string): number {
  if (to < from) return 0;
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}
