import type { GradeCode } from "@/lib/codes";
import type { CandidateJudgement } from "./promotion";

export type ItemSource = {
  name: string;
  orgName: string;
  grade: GradeCode;
  hireDate: string;
  gradeDate: string;
  ratings: { year: number; rating: string }[];
  training: { year: number; hours: number }[];
  awards: { date: string; name: string }[];
  disciplines: { date: string; subType: string }[];
};

export type BuiltItem = {
  itemKey: string;
  label: string;
  sortOrder: number;
  value: string;
  correctable: boolean;
};

// 신청서의 15개 항목을 순서대로 생성
export function buildApplicationItems(
  src: ItemSource,
  judgement: CandidateJudgement,
  baseDate: string,
): BuiltItem[] {
  const items: BuiltItem[] = [];

  const add = (
    itemKey: string,
    label: string,
    value: string,
    correctable: boolean,
  ) => {
    items.push({
      itemKey,
      label,
      sortOrder: items.length + 1,
      value,
      correctable,
    });
  };

  const gradeName = (grade: GradeCode) => `${grade.slice(1)}급`;

  add("name", "성명", src.name, false);
  add("org", "소속", src.orgName, true);
  add("grade", "현 직급", gradeName(src.grade), false);
  add(
    "target_grade",
    "승진 예정 직급",
    gradeName(judgement.targetGrade),
    false,
  );
  add("hire_date", "입사일", src.hireDate, true);
  add("grade_date", "현 직급 임용일", src.gradeDate, true);
  add("qualify_date", "소요기간 충족일", judgement.qualifyDate, false);

  const baseYear = Number(baseDate.slice(0, 4));

  for (let year = baseYear - 2; year <= baseYear; year++) {
    const rating = src.ratings.find((r) => r.year === year);
    add(`rating_${year}`, `${year}년 근무평정`, rating?.rating ?? "-", true);
  }

  for (let year = baseYear - 2; year <= baseYear; year++) {
    const training = src.training.find((t) => t.year === year);
    add(
      `training_${year}`,
      `${year}년 교육이수시간`,
      training ? String(training.hours) : "-",
      true,
    );
  }

  const awards = [...src.awards]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => `${a.date} ${a.name}`)
    .join(", ");

  add("awards", "포상", awards || "없음", true);

  const disciplineNames: Record<string, string> = {
    REPRIMAND: "견책",
    PAY_CUT: "감봉",
    SUSPENSION: "정직",
  };

  const disciplines = [...src.disciplines]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => `${d.date} ${disciplineNames[d.subType] ?? d.subType}`)
    .join(", ");

  add("disciplines", "징계", disciplines || "없음", true);

  return items;
}
