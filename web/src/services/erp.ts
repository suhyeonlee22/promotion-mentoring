import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  srcEmployee,
  srcOrg,
  srcAppointment,
  srcEvaluation,
  srcTraining,
  srcAward,
} from "@/db/schema";
import { GRADES } from "@/lib/codes";
import type { Tx } from "@/lib/history";
import type { CandidateInput } from "@/domain/promotion";
import type { ItemSource } from "@/domain/items";
import type { ApptInput } from "@/domain/period";

/** ERP는 읽기만 하며, 같은 트랜잭션에서 조회한 값을 규칙 엔진에 전달한다. */
export async function loadErpEmployees(reader: Tx | typeof db = db) {
  const employees = await reader
    .select({ employee: srcEmployee, orgName: srcOrg.orgName })
    .from(srcEmployee)
    .innerJoin(srcOrg, eq(srcEmployee.orgId, srcOrg.orgId));
  const appointments = await reader.select().from(srcAppointment);
  const ratings = await reader.select().from(srcEvaluation);
  const training = await reader.select().from(srcTraining);
  const awards = await reader.select().from(srcAward);
  return employees.map(({ employee: e, orgName }) => {
    const grade = GRADES.find((g) => g.code === e.grade)?.code;
    if (!grade || (e.status !== "ACTIVE" && e.status !== "RETIRED"))
      throw new Error(`ERP 직원 코드가 올바르지 않습니다: ${e.empNo}`);
    const appts: ApptInput[] = appointments
      .filter((a) => a.empNo === e.empNo)
      .map((a) => {
        if (
          !["HIRE", "PROMOTE", "STEP_UP", "LEAVE", "DISCIPLINE"].includes(
            a.apptType,
          )
        )
          throw new Error(`ERP 발령 코드가 올바르지 않습니다: ${a.apptId}`);
        return {
          apptType: a.apptType as ApptInput["apptType"],
          subType: a.subType,
          startDate: a.startDate,
          endDate: a.endDate,
        };
      });
    const candidate: CandidateInput = {
      grade,
      status: e.status,
      gradeDate: e.gradeDate,
      appointments: appts,
    };
    const items: ItemSource = {
      name: e.name,
      orgName,
      grade,
      hireDate: e.hireDate,
      gradeDate: e.gradeDate,
      ratings: ratings.filter((r) => r.empNo === e.empNo),
      training: training.filter((t) => t.empNo === e.empNo),
      awards: awards
        .filter((a) => a.empNo === e.empNo)
        .map((a) => ({ date: a.awardDate, name: a.awardName })),
      disciplines: appts
        .filter((a) => a.apptType === "DISCIPLINE")
        .map((a) => ({ date: a.startDate, subType: a.subType ?? "" })),
    };
    return { empNo: e.empNo, email: e.email, candidate, items };
  });
}
