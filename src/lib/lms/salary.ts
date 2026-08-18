import type {
  LmsCourse,
  LmsCourseOffering,
  LmsDepartment,
  LmsEmploymentType,
  LmsLectureDelivery,
  LmsPayBasis,
  LmsSemester,
  LmsTeacherAssignment,
  LmsTeacherProfile,
} from "@/lib/lms/types";

export type SalaryPeriodMode = "month" | "semester" | "custom";

export type SalaryPeriodInput = {
  mode: SalaryPeriodMode;
  /** YYYY-MM when mode = month */
  month?: string;
  semesterId?: string;
  customFrom?: string;
  customTo?: string;
};

export type SalaryCourseLine = {
  offeringId: string;
  courseCode: string;
  courseName: string;
  semesterName: string;
  departmentCode: string;
  theoryLectures: number;
  labLectures: number;
  lecturesCounted: number;
  unitRate: number;
  lineAmount: number;
};

export type SalaryTeacherRow = {
  teacherUserId: string;
  teacherName: string;
  employeeCode: string | null;
  employmentType: LmsEmploymentType;
  payBasis: LmsPayBasis;
  calcMode: "fixed" | "lecture";
  fixedSalary: number;
  perLectureRate: number;
  totalLectures: number;
  theoryLectures: number;
  labLectures: number;
  totalAmount: number;
  courses: SalaryCourseLine[];
};

function datesOverlap(
  startA: string | null,
  endA: string | null,
  startB: string,
  endB: string,
): boolean {
  const aStart = startA ?? "0001-01-01";
  const aEnd = endA ?? "9999-12-31";
  return aStart <= endB && aEnd >= startB;
}

export function salaryPeriodKey(input: SalaryPeriodInput): string {
  if (input.mode === "month") {
    if (!input.month) throw new Error("Select a month");
    return `month:${input.month}`;
  }
  if (input.mode === "semester") {
    if (!input.semesterId) throw new Error("Select a semester");
    return `semester:${input.semesterId}`;
  }
  if (!input.customFrom || !input.customTo) throw new Error("Select a custom date range");
  if (input.customTo < input.customFrom) throw new Error("End date must be on or after start date");
  return `custom:${input.customFrom}:${input.customTo}`;
}

export function salaryPeriodBounds(
  input: SalaryPeriodInput,
  semesters: LmsSemester[],
): { from: string; to: string } | null {
  if (input.mode === "month") {
    if (!input.month) return null;
    const [y, m] = input.month.split("-").map(Number);
    const from = `${input.month}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${input.month}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }
  if (input.mode === "semester") {
    const semester = semesters.find((s) => s.id === input.semesterId);
    if (!semester) return null;
    return {
      from: semester.start_date ?? "0001-01-01",
      to: semester.end_date ?? "9999-12-31",
    };
  }
  if (!input.customFrom || !input.customTo) return null;
  return { from: input.customFrom, to: input.customTo };
}

export function filterSemestersForPeriod(
  semesters: LmsSemester[],
  input: SalaryPeriodInput,
): LmsSemester[] {
  if (input.mode === "semester") {
    return semesters.filter((s) => s.id === input.semesterId);
  }
  const bounds = salaryPeriodBounds(input, semesters);
  if (!bounds) return [];
  return semesters.filter((s) => datesOverlap(s.start_date, s.end_date, bounds.from, bounds.to));
}

/** Permanent → fixed; visiting → lecture; contract follows pay_basis (hourly treated as lecture). */
export function resolveCalcMode(
  employmentType: LmsEmploymentType,
  payBasis: LmsPayBasis,
): "fixed" | "lecture" {
  if (employmentType === "permanent") return "fixed";
  if (employmentType === "visiting") return "lecture";
  if (payBasis === "fixed_salary") return "fixed";
  return "lecture";
}

export function buildSalarySheet(args: {
  period: SalaryPeriodInput;
  teachers: LmsTeacherProfile[];
  teacherNames: Record<string, string>;
  assignments: LmsTeacherAssignment[];
  offerings: LmsCourseOffering[];
  courses: LmsCourse[];
  semesters: LmsSemester[];
  departments: LmsDepartment[];
  deliveries: LmsLectureDelivery[];
}): SalaryTeacherRow[] {
  const scopedSemesters = filterSemestersForPeriod(args.semesters, args.period);
  const semesterIds = new Set(scopedSemesters.map((s) => s.id));
  const scopedOfferings = args.offerings.filter(
    (o) => semesterIds.has(o.semester_instance_id) && o.status === "active",
  );
  const offeringIds = new Set(scopedOfferings.map((o) => o.id));
  const scopedAssignments = args.assignments.filter((a) => offeringIds.has(a.offering_id));

  const bounds = salaryPeriodBounds(args.period, args.semesters);
  if (!bounds) return [];

  const deliveriesInPeriod = args.deliveries.filter(
    (d) =>
      offeringIds.has(d.offering_id) &&
      d.delivery_date >= bounds.from &&
      d.delivery_date <= bounds.to,
  );

  const courseMap = new Map(args.courses.map((c) => [c.id, c]));
  const semesterMap = new Map(args.semesters.map((s) => [s.id, s]));
  const deptMap = new Map(args.departments.map((d) => [d.id, d]));
  const offeringMap = new Map(scopedOfferings.map((o) => [o.id, o]));

  const byTeacher = new Map<string, typeof scopedAssignments>();
  for (const assignment of scopedAssignments) {
    const list = byTeacher.get(assignment.teacher_user_id) ?? [];
    list.push(assignment);
    byTeacher.set(assignment.teacher_user_id, list);
  }

  const rows: SalaryTeacherRow[] = [];

  for (const teacher of args.teachers.filter((t) => t.is_active)) {
    const teacherAssignments = byTeacher.get(teacher.user_id) ?? [];
    if (!teacherAssignments.length) continue;

    const calcMode = resolveCalcMode(teacher.employment_type, teacher.pay_basis);
    const courses: SalaryCourseLine[] = [];

    for (const assignment of teacherAssignments) {
      const offering = offeringMap.get(assignment.offering_id);
      if (!offering) continue;
      const course = courseMap.get(offering.course_id);
      const semester = semesterMap.get(offering.semester_instance_id);
      if (!course || !semester) continue;
      const dept = deptMap.get(semester.department_id);

      const courseDeliveries = deliveriesInPeriod.filter(
        (d) => d.offering_id === offering.id && d.teacher_user_id === teacher.user_id,
      );
      const theoryLectures = courseDeliveries.filter((d) => d.session_type === "theory").length;
      const labLectures = courseDeliveries.filter((d) => d.session_type === "lab").length;
      const lecturesCounted = theoryLectures + labLectures;
      const unitRate = calcMode === "lecture" ? Number(teacher.per_lecture_rate ?? 0) : 0;
      const lineAmount = calcMode === "lecture" ? lecturesCounted * unitRate : 0;

      courses.push({
        offeringId: offering.id,
        courseCode: course.code,
        courseName: course.name,
        semesterName: semester.name,
        departmentCode: dept?.code ?? "BS",
        theoryLectures,
        labLectures,
        lecturesCounted,
        unitRate,
        lineAmount,
      });
    }

    if (!courses.length) continue;

    const theoryLectures = courses.reduce((sum, c) => sum + c.theoryLectures, 0);
    const labLectures = courses.reduce((sum, c) => sum + c.labLectures, 0);
    const totalLectures = theoryLectures + labLectures;
    const totalAmount =
      calcMode === "fixed"
        ? Number(teacher.fixed_salary ?? 0)
        : courses.reduce((sum, c) => sum + c.lineAmount, 0);

    rows.push({
      teacherUserId: teacher.user_id,
      teacherName: args.teacherNames[teacher.user_id] ?? teacher.employee_code ?? "Teacher",
      employeeCode: teacher.employee_code,
      employmentType: teacher.employment_type,
      payBasis: teacher.pay_basis,
      calcMode,
      fixedSalary: Number(teacher.fixed_salary ?? 0),
      perLectureRate: Number(teacher.per_lecture_rate ?? 0),
      totalLectures,
      theoryLectures,
      labLectures,
      totalAmount,
      courses,
    });
  }

  return rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}

export function formatSalaryMoney(n: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}
