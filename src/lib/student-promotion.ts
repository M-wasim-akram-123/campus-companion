import type { SupabaseClient } from "@supabase/supabase-js";
import {
  currentAcademicYearStart,
  isOnOrAfterAcademicYearStart,
  ordinalYearLabel,
  targetYearLevelForStudent,
} from "@/lib/academic";
import {
  generateCollectionPlanDueDates,
  type FeeCollectionPlan,
} from "@/lib/fee-collection-plans";
import {
  componentLabel,
  generateAnnualInstallmentRows,
  generateAnnualInstallmentRowsFromCollectionPlan,
} from "@/lib/fees";
import type { FeeComponentType, InstallmentPreview } from "@/lib/fees-types";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type PromotionResult = {
  academicYearStart: number;
  promoted: number;
  skipped: number;
  errors: { studentId: string; rollNumber: string; message: string }[];
  inchargeSectionsMirrored: number;
};

type StudentRow = {
  id: string;
  roll_number: string;
  status: string;
  enrollment_type: string;
  program_id: string | null;
  class_id: string | null;
  section_id: string | null;
  academic_session_id: string | null;
  admission_year_level: number | null;
  classes: { year_level: number } | null;
  sections: { name: string; gender: string; session_id: string } | null;
  academic_sessions: { start_year: number; end_year: number } | null;
};

async function fetchCollectionPlan(
  client: Db,
  id: string | null,
): Promise<FeeCollectionPlan | null> {
  if (!id) return null;
  const { data, error } = await client
    .from("fee_collection_plans")
    .select("id, name, description, collection_months, due_day, is_active, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    collection_months: (data.collection_months ?? []).map(Number),
    due_day: Number(data.due_day ?? 10),
    is_active: data.is_active,
    sort_order: Number(data.sort_order ?? 0),
  };
}

function projectionInstallments(params: {
  cycleLabel: string;
  componentType: FeeComponentType;
  payableAmount: number;
  dueDate: string | null;
  collectionPlan: FeeCollectionPlan | null;
  academicYearStart: number;
  schedule: string;
  installmentCount: number;
  startOrder: number;
}): InstallmentPreview[] {
  const amount = Number(params.payableAmount ?? 0);
  if (amount <= 0) return [];

  if (params.componentType === "annual_fee") {
    if (params.collectionPlan) {
      return generateAnnualInstallmentRowsFromCollectionPlan({
        annualFee: amount,
        collectionPlan: params.collectionPlan,
        sessionStartYear: params.academicYearStart,
        startOrder: params.startOrder,
      }).map((row) => ({
        ...row,
        label: `${params.cycleLabel} — ${row.label}`,
      }));
    }
    return generateAnnualInstallmentRows({
      annualFee: amount,
      schedule: params.schedule as "monthly",
      installmentCount: params.installmentCount,
      firstDueDate: `${params.academicYearStart}-07-10`,
      startOrder: params.startOrder,
    }).map((row) => ({
      ...row,
      label: `${params.cycleLabel} — ${row.label}`,
    }));
  }

  const due =
    params.dueDate ??
    (params.collectionPlan
      ? generateCollectionPlanDueDates(params.collectionPlan, params.academicYearStart)[0]
      : `${params.academicYearStart}-07-10`);

  return [
    {
      label: `${params.cycleLabel} — ${componentLabel(params.componentType)}`,
      component_type: params.componentType,
      amount,
      due_date: due,
      sort_order: params.startOrder,
    },
  ];
}

async function mirrorCampusInchargeSection(
  client: Db,
  fromSectionId: string,
  toSectionId: string,
): Promise<number> {
  if (fromSectionId === toSectionId) return 0;

  const { data: assignments, error } = await client
    .from("campus_incharge_assignments")
    .select("user_id")
    .eq("section_id", fromSectionId);
  if (error || !assignments?.length) return 0;

  let added = 0;
  for (const row of assignments) {
    const { data: existing } = await client
      .from("campus_incharge_assignments")
      .select("user_id")
      .eq("user_id", row.user_id)
      .eq("section_id", toSectionId)
      .maybeSingle();
    if (existing) continue;

    const { error: insertErr } = await client
      .from("campus_incharge_assignments")
      .insert({ user_id: row.user_id, section_id: toSectionId });
    if (!insertErr) added += 1;
  }
  return added;
}

async function findTargetClass(client: Db, programId: string, yearLevel: number) {
  const { data } = await client
    .from("classes")
    .select("id, year_level, name")
    .eq("program_id", programId)
    .eq("year_level", yearLevel)
    .maybeSingle();
  return data;
}

async function findTargetSection(
  client: Db,
  params: {
    classId: string;
    sessionId: string;
    gender: string;
    sectionName: string;
  },
) {
  const { data } = await client
    .from("sections")
    .select("id, name, gender, class_id")
    .eq("class_id", params.classId)
    .eq("session_id", params.sessionId)
    .eq("gender", params.gender as Database["public"]["Enums"]["section_gender"])
    .eq("name", params.sectionName)
    .maybeSingle();
  return data;
}

async function materializeCycleInstallments(
  client: Db,
  studentId: string,
  feePlanId: string,
  cycleNo: number,
  academicYearStart: number,
): Promise<number> {
  const { data: projections, error: projErr } = await client
    .from("student_fee_projections")
    .select("*")
    .eq("student_id", studentId)
    .eq("fee_plan_id", feePlanId)
    .eq("cycle_no", cycleNo);
  if (projErr) throw projErr;
  if (!projections?.length) return 0;

  const { data: feePlan } = await client
    .from("student_fee_plans")
    .select("collection_plan_id, annual_fee_schedule, installment_count")
    .eq("id", feePlanId)
    .single();
  if (!feePlan) return 0;

  const collectionPlan = await fetchCollectionPlan(client, feePlan.collection_plan_id);

  const { data: maxRow } = await client
    .from("student_fee_installments")
    .select("sort_order")
    .eq("student_id", studentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sortOrder = Number(maxRow?.sort_order ?? 0) + 1;
  const rows: InstallmentPreview[] = [];

  for (const proj of projections) {
    const componentType = proj.component_type as FeeComponentType;
    const batch = projectionInstallments({
      cycleLabel: proj.cycle_label,
      componentType,
      payableAmount: Number(proj.payable_amount),
      dueDate: proj.due_date,
      collectionPlan,
      academicYearStart,
      schedule: feePlan.annual_fee_schedule ?? "monthly",
      installmentCount: Number(feePlan.installment_count ?? 4),
      startOrder: sortOrder,
    });
    rows.push(...batch);
    sortOrder += batch.length;
  }

  if (!rows.length) return 0;

  const { error: instErr } = await client.from("student_fee_installments").insert(
    rows.map((row) => ({
      student_id: studentId,
      fee_plan_id: feePlanId,
      label: row.label,
      component_type: row.component_type,
      amount: row.amount,
      due_date: row.due_date,
      sort_order: row.sort_order,
      status: "pending",
      fee_cycle: cycleNo,
      academic_year_start: academicYearStart,
    })),
  );
  if (instErr) throw instErr;

  return rows.length;
}

export async function runSessionPromotions(
  client: Db,
  options?: { now?: Date; sessionId?: string },
): Promise<PromotionResult> {
  const now = options?.now ?? new Date();
  const academicYearStart = currentAcademicYearStart(now);

  if (!isOnOrAfterAcademicYearStart(academicYearStart, now)) {
    return {
      academicYearStart,
      promoted: 0,
      skipped: 0,
      errors: [],
      inchargeSectionsMirrored: 0,
    };
  }

  let studentQuery = client
    .from("students")
    .select(
      "id, roll_number, status, enrollment_type, program_id, class_id, section_id, academic_session_id, admission_year_level, classes(year_level), sections(name, gender, session_id), academic_sessions(start_year, end_year)",
    )
    .eq("status", "active")
    .eq("enrollment_type", "regular");

  if (options?.sessionId) {
    studentQuery = studentQuery.eq("academic_session_id", options.sessionId);
  }

  const { data: students, error: stErr } = await studentQuery;
  if (stErr) throw stErr;

  const { data: existingLogs } = await client
    .from("student_promotion_log")
    .select("student_id")
    .eq("academic_year_start", academicYearStart);

  const alreadyPromoted = new Set((existingLogs ?? []).map((r) => r.student_id));

  const result: PromotionResult = {
    academicYearStart,
    promoted: 0,
    skipped: 0,
    errors: [],
    inchargeSectionsMirrored: 0,
  };

  const mirroredPairs = new Set<string>();

  for (const raw of students ?? []) {
    const student = raw as StudentRow;
    if (alreadyPromoted.has(student.id)) {
      result.skipped += 1;
      continue;
    }

    const session = student.academic_sessions;
    const storedYearLevel = student.classes?.year_level;
    const section = student.sections;
    if (!session?.start_year || !storedYearLevel || !student.program_id || !student.academic_session_id) {
      result.skipped += 1;
      continue;
    }

    const admissionYearLevel = student.admission_year_level ?? student.classes?.year_level ?? 1;
    const targetYear = targetYearLevelForStudent({
      sessionStartYear: session.start_year,
      admissionYearLevel,
      now,
    });

    if (targetYear <= storedYearLevel) {
      result.skipped += 1;
      continue;
    }

    const promoteToYear = storedYearLevel + 1;
    if (targetYear < promoteToYear) {
      result.skipped += 1;
      continue;
    }

    try {
      const targetClass = await findTargetClass(client, student.program_id, promoteToYear);
      if (!targetClass) {
        throw new Error(`No class found for ${ordinalYearLabel(promoteToYear)} in this program.`);
      }

      let targetSectionId: string | null = student.section_id;
      if (section?.name && section.gender && student.section_id) {
        const targetSection = await findTargetSection(client, {
          classId: targetClass.id,
          sessionId: student.academic_session_id,
          gender: section.gender,
          sectionName: section.name,
        });
        if (!targetSection) {
          throw new Error(
            `No matching ${ordinalYearLabel(promoteToYear)} section "${section.name}" (${section.gender}). Create it in Academic settings first.`,
          );
        }
        targetSectionId = targetSection.id;

        const pairKey = `${student.section_id}:${targetSection.id}`;
        if (!mirroredPairs.has(pairKey)) {
          result.inchargeSectionsMirrored += await mirrorCampusInchargeSection(
            client,
            student.section_id,
            targetSection.id,
          );
          mirroredPairs.add(pairKey);
        }
      }

      const { data: feePlan } = await client
        .from("student_fee_plans")
        .select("id")
        .eq("student_id", student.id)
        .maybeSingle();

      let installmentsAdded = 0;
      if (feePlan?.id) {
        installmentsAdded = await materializeCycleInstallments(
          client,
          student.id,
          feePlan.id,
          promoteToYear,
          academicYearStart,
        );
      }

      const { error: updateErr } = await client
        .from("students")
        .update({
          class_id: targetClass.id,
          section_id: targetSectionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", student.id);
      if (updateErr) throw updateErr;

      const { error: logErr } = await client.from("student_promotion_log").insert({
        student_id: student.id,
        academic_session_id: student.academic_session_id,
        academic_year_start: academicYearStart,
        from_year_level: storedYearLevel,
        to_year_level: promoteToYear,
        from_class_id: student.class_id,
        to_class_id: targetClass.id,
        from_section_id: student.section_id,
        to_section_id: targetSectionId,
        fee_installments_added: installmentsAdded,
        notes: `Auto-promoted to ${ordinalYearLabel(promoteToYear)} on ${now.toISOString().slice(0, 10)}`,
      });
      if (logErr) throw logErr;

      result.promoted += 1;
    } catch (err) {
      result.errors.push({
        studentId: student.id,
        rollNumber: student.roll_number,
        message: err instanceof Error ? err.message : "Promotion failed",
      });
    }
  }

  return result;
}
