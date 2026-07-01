export type StudentEnrollmentType = "regular" | "classes_only";

export const ENROLLMENT_TYPE_OPTIONS: {
  value: StudentEnrollmentType;
  label: string;
  description: string;
}[] = [
  {
    value: "regular",
    label: "Regular student",
    description: "Full admission — board exams and standard session fee schedule.",
  },
  {
    value: "classes_only",
    label: "Classes only",
    description: "Attends classes only (no board exam from college). All fees due within 2–3 months.",
  },
];

export function enrollmentTypeLabel(type: StudentEnrollmentType | string | null | undefined): string {
  return ENROLLMENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "Regular student";
}

export function isClassesOnlyEnrollment(type: StudentEnrollmentType | string | null | undefined): boolean {
  return type === "classes_only";
}

function addMonthsIso(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(y, m - 1, d || 1);
  date.setMonth(date.getMonth() + months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildClassesOnlyInstallments(params: {
  classesFeeTotal: number;
  clearanceMonths: 2 | 3;
  admissionDate?: string;
}) {
  const total = Math.max(0, Math.round(params.classesFeeTotal));
  const months = params.clearanceMonths;
  const startDate = params.admissionDate ?? new Date().toISOString().slice(0, 10);

  if (total <= 0) {
    return [] as { label: string; amount: number; due_date: string; sort_order: number }[];
  }

  const base = Math.floor(total / months);
  const installments = [];
  let allocated = 0;

  for (let i = 0; i < months; i += 1) {
    const amount = i === months - 1 ? total - allocated : base;
    allocated += amount;
    installments.push({
      label: `Classes fee — month ${i + 1} of ${months}`,
      amount,
      due_date: addMonthsIso(startDate, i),
      sort_order: i,
    });
  }

  return installments;
}
