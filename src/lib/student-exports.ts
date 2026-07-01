import { installmentBalance } from "@/lib/finance";

type StudentExportRow = {
  id: string;
  full_name: string;
  roll_number: string;
  father_name?: string | null;
  phone?: string | null;
  guardian_phone?: string | null;
  guardian_name?: string | null;
  status?: string | null;
  class_id?: string | null;
  programs?: { name?: string } | null;
  classes?: { name?: string } | null;
  sections?: { name?: string; gender?: string } | null;
};

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header.join(","), ...rows.map((row) => row.map(csvEscape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sectionLabel(section: StudentExportRow["sections"]) {
  if (!section?.name) return "";
  const gender = section.gender === "girls" ? "Girls" : "Boys";
  return `${gender} — ${section.name}`;
}

export function exportStudentPhoneList(students: StudentExportRow[]) {
  downloadCsv(
    `student-phone-list-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "Admission no",
      "Student",
      "Father",
      "Phone",
      "Guardian phone",
      "Program",
      "Class",
      "Section",
      "Status",
    ],
    students.map((s) => [
      s.roll_number,
      s.full_name,
      s.father_name ?? "",
      s.phone ?? "",
      s.guardian_phone ?? "",
      (s.programs as { name?: string } | null)?.name ?? "",
      (s.classes as { name?: string } | null)?.name ?? "",
      sectionLabel(s.sections),
      s.status ?? "",
    ]),
  );
}

type InstallmentRow = {
  student_id: string;
  label: string;
  due_date: string;
  amount: number;
  paid_amount: number;
};

export function exportStudentDefaulters(
  students: StudentExportRow[],
  installments: InstallmentRow[],
  today = new Date().toISOString().slice(0, 10),
) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const grouped = new Map<
    string,
    { student: StudentExportRow; balance: number; oldestDue: string; lines: string[] }
  >();

  for (const inst of installments) {
    const balance = installmentBalance(inst);
    if (balance <= 0 || inst.due_date >= today) continue;
    const student = studentMap.get(inst.student_id);
    if (!student) continue;

    const current = grouped.get(inst.student_id) ?? {
      student,
      balance: 0,
      oldestDue: inst.due_date,
      lines: [],
    };
    current.balance += balance;
    if (inst.due_date < current.oldestDue) current.oldestDue = inst.due_date;
    current.lines.push(`${inst.label} (${inst.due_date}): ${balance}`);
    grouped.set(inst.student_id, current);
  }

  const rows = [...grouped.values()].sort((a, b) =>
    a.student.full_name.localeCompare(b.student.full_name),
  );

  downloadCsv(
    `fee-defaulters-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "Admission no",
      "Student",
      "Father",
      "Phone",
      "Guardian phone",
      "Program",
      "Class",
      "Section",
      "Total overdue",
      "Oldest due date",
      "Overdue items",
    ],
    rows.map((row) => [
      row.student.roll_number,
      row.student.full_name,
      row.student.father_name ?? "",
      row.student.phone ?? "",
      row.student.guardian_phone ?? "",
      (row.student.programs as { name?: string } | null)?.name ?? "",
      (row.student.classes as { name?: string } | null)?.name ?? "",
      sectionLabel(row.student.sections),
      String(row.balance),
      row.oldestDue,
      row.lines.join("; "),
    ]),
  );

  return rows.length;
}
