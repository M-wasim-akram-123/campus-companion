import { CAMPUS_NAME } from "@/lib/campus";
import { normalizePhoneForWhatsApp } from "@/lib/phone";
import { formatCurrency, installmentBalance, type fetchOverdueInstallments } from "@/lib/finance";

export type OverdueRow = Awaited<ReturnType<typeof fetchOverdueInstallments>>[number];

export type OverdueStudentGroup = {
  studentId: string;
  sectionId: string;
  fullName: string;
  rollNumber: string;
  fatherName: string;
  phone: string;
  guardianPhone: string;
  program: string;
  section: string;
  totalBalance: number;
  oldestDueDate: string;
  maxDaysOverdue: number;
  installments: { id: string; label: string; due_date: string; balance: number; daysOverdue: number }[];
};

export const DEFAULT_REMINDER_TEMPLATE = `Assalam-o-Alaikum,

Fee reminder from {{campus}} for {{student}} (Adm: {{roll}}).

Outstanding: {{amount}}
Due since: {{dueDate}}
{{feeLines}}

Please clear dues at the finance office at your earliest.

JazakAllah
{{campus}}`;

export const REMINDER_TEMPLATE_KEY = "finance-reminder-template";

export function getReminderTemplate(): string {
  if (typeof window === "undefined") return DEFAULT_REMINDER_TEMPLATE;
  return localStorage.getItem(REMINDER_TEMPLATE_KEY) || DEFAULT_REMINDER_TEMPLATE;
}

export function saveReminderTemplate(template: string) {
  localStorage.setItem(REMINDER_TEMPLATE_KEY, template);
}

export { normalizePhoneForWhatsApp } from "@/lib/phone";

export function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (86400000)));
}

function studentFromRow(r: OverdueRow) {
  return r.students as {
    id?: string;
    full_name?: string;
    roll_number?: string;
    father_name?: string;
    phone?: string;
    guardian_phone?: string;
    guardian_name?: string;
    programs?: { name?: string };
    sections?: { name?: string; gender?: string };
    academic_session_id?: string;
    section_id?: string;
  };
}

export function bestContactPhone(r: OverdueRow): string {
  const st = studentFromRow(r);
  return (st?.guardian_phone || st?.phone || "").trim();
}

export function filterOverdueRows(
  rows: OverdueRow[],
  opts: {
    sessionId?: string;
    sectionId?: string;
    gender?: "boys" | "girls";
    dueScope?: "all_unpaid" | "overdue" | "due_soon";
    minDaysOverdue?: number;
    search?: string;
  },
): OverdueRow[] {
  const q = opts.search?.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);

  return rows.filter((r) => {
    const st = studentFromRow(r);
    const due = new Date(r.due_date);
    due.setHours(0, 0, 0, 0);

    if (opts.dueScope === "overdue" && due >= today) return false;
    if (opts.dueScope === "due_soon" && due > soon) return false;
    if (opts.sessionId && st?.academic_session_id !== opts.sessionId) return false;
    if (opts.sectionId && st?.section_id !== opts.sectionId) return false;
    if (opts.gender && st?.sections?.gender !== opts.gender) return false;
    if (opts.minDaysOverdue && daysOverdue(r.due_date) < opts.minDaysOverdue) return false;
    if (q) {
      const hay = `${st?.full_name ?? ""} ${st?.roll_number ?? ""} ${st?.father_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function groupOverdueByStudent(rows: OverdueRow[]): OverdueStudentGroup[] {
  const map = new Map<string, OverdueStudentGroup>();

  for (const r of rows) {
    const st = studentFromRow(r);
    const sid = (st as { id?: string })?.id ?? r.student_id;
    const balance = installmentBalance(r);
    const days = daysOverdue(r.due_date);
    const sec = st?.sections
      ? `${st.sections.gender === "girls" ? "Girls" : "Boys"} — ${st.sections.name}`
      : "—";

    if (!map.has(sid)) {
      map.set(sid, {
        studentId: sid,
        sectionId: st?.section_id ?? "",
        fullName: st?.full_name ?? "—",
        rollNumber: st?.roll_number ?? "—",
        fatherName: st?.father_name ?? "—",
        phone: st?.phone ?? "",
        guardianPhone: st?.guardian_phone ?? "",
        program: st?.programs?.name ?? "—",
        section: sec,
        totalBalance: 0,
        oldestDueDate: r.due_date,
        maxDaysOverdue: days,
        installments: [],
      });
    }

    const g = map.get(sid)!;
    g.totalBalance += balance;
    g.installments.push({ id: r.id, label: r.label, due_date: r.due_date, balance, daysOverdue: days });
    if (r.due_date < g.oldestDueDate) g.oldestDueDate = r.due_date;
    if (days > g.maxDaysOverdue) g.maxDaysOverdue = days;
  }

  return [...map.values()].sort((a, b) => b.totalBalance - a.totalBalance);
}

export function buildReminderMessage(
  template: string,
  opts: {
    student: string;
    roll: string;
    amount: string;
    dueDate: string;
    feeLines: string;
  },
): string {
  return template
    .replace(/\{\{campus\}\}/g, CAMPUS_NAME)
    .replace(/\{\{student\}\}/g, opts.student)
    .replace(/\{\{roll\}\}/g, opts.roll)
    .replace(/\{\{amount\}\}/g, opts.amount)
    .replace(/\{\{dueDate\}\}/g, opts.dueDate)
    .replace(/\{\{feeLines\}\}/g, opts.feeLines);
}

export function messageForInstallment(r: OverdueRow, template?: string): string {
  const st = studentFromRow(r);
  const tpl = template ?? getReminderTemplate();
  return buildReminderMessage(tpl, {
    student: st?.full_name ?? "",
    roll: st?.roll_number ?? "",
    amount: formatCurrency(installmentBalance(r)),
    dueDate: r.due_date,
    feeLines: `Fee: ${r.label}`,
  });
}

export function messageForStudentGroup(g: OverdueStudentGroup, template?: string): string {
  const tpl = template ?? getReminderTemplate();
  const feeLines = g.installments
    .map((i) => `• ${i.label}: ${formatCurrency(i.balance)} (due ${i.due_date}, ${i.daysOverdue}d late)`)
    .join("\n");
  return buildReminderMessage(tpl, {
    student: g.fullName,
    roll: g.rollNumber,
    amount: formatCurrency(g.totalBalance),
    dueDate: g.oldestDueDate,
    feeLines,
  });
}

export function whatsAppUrl(phone: string, message: string): string {
  const wa = normalizePhoneForWhatsApp(phone);
  if (!wa) return "";
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}

export function smsUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function exportPhoneList(groups: OverdueStudentGroup[]): string {
  const lines = ["Phone,Name,Roll,Balance"];
  for (const g of groups) {
    const phone = g.guardianPhone || g.phone;
    if (!phone) continue;
    lines.push(
      [phone, g.fullName, g.rollNumber, String(g.totalBalance)]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}
