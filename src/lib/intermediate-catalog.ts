import { supabase } from "@/integrations/supabase/client";
import { fetchProfilesByRole } from "@/lib/staff";

export type IntermediateSubject = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type IntermediateSectionOption = {
  id: string;
  name: string;
  gender: "boys" | "girls";
  className: string;
  yearLevel: number;
  programName: string;
  sessionId: string | null;
  sessionLabel: string;
  sessionIsActive: boolean;
};

export type IntermediateTeacherOption = {
  id: string;
  fullName: string;
  phone: string | null;
};

export type IntermediateSectionSubjectAssignment = {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherUserId: string;
  sectionLabel: string;
  subjectLabel: string;
  teacherName: string;
  sessionLabel: string;
  yearLevel: number;
};

export type MyIntermediateSubjectAssignment = {
  id: string;
  sectionId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  sectionGender: "boys" | "girls";
  sessionId: string;
  sessionLabel: string;
  yearLevel: number;
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function listIntermediateSubjects(
  includeInactive = false,
): Promise<IntermediateSubject[]> {
  let query = supabase
    .from("intermediate_subjects")
    .select("id, code, name, is_active")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) fail(error, "Could not load Intermediate subjects");
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  }));
}

export async function createIntermediateSubject(input: {
  code: string;
  name: string;
  createdBy?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("intermediate_subjects").insert({
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    created_by: input.createdBy ?? null,
  });
  if (error) fail(error, "Could not create subject");
}

export async function updateIntermediateSubject(
  id: string,
  patch: { code?: string; name?: string; isActive?: boolean },
): Promise<void> {
  const values: {
    code?: string;
    name?: string;
    is_active?: boolean;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (patch.code != null) values.code = patch.code.trim().toUpperCase();
  if (patch.name != null) values.name = patch.name.trim();
  if (patch.isActive != null) values.is_active = patch.isActive;

  const { error } = await supabase.from("intermediate_subjects").update(values).eq("id", id);
  if (error) fail(error, "Could not update subject");
}

export async function listIntermediateSections(): Promise<IntermediateSectionOption[]> {
  const { data, error } = await supabase
    .from("sections")
    .select(
      "id, name, gender, session_id, academic_sessions(label, is_active), classes!inner(name, year_level, programs!inner(name, type))",
    )
    .eq("classes.programs.type", "intermediate")
    .order("name");
  if (error) fail(error, "Could not load Intermediate sections");

  return (data ?? [])
    .map((row) => {
      const cls = row.classes as {
        name?: string;
        year_level?: number;
        programs?: { name?: string; type?: string } | null;
      } | null;
      if (cls?.programs?.type !== "intermediate") return null;
      const session = row.academic_sessions as { label?: string; is_active?: boolean } | null;
      return {
        id: row.id,
        name: row.name,
        gender: row.gender as "boys" | "girls",
        className: cls?.name ?? "Class",
        yearLevel: cls?.year_level ?? 0,
        programName: cls?.programs?.name ?? "Intermediate",
        sessionId: row.session_id,
        sessionLabel: session?.label ?? "No session",
        sessionIsActive: session?.is_active ?? false,
      } satisfies IntermediateSectionOption;
    })
    .filter((row): row is IntermediateSectionOption => Boolean(row))
    .sort(
      (a, b) =>
        b.sessionLabel.localeCompare(a.sessionLabel) ||
        a.yearLevel - b.yearLevel ||
        a.programName.localeCompare(b.programName) ||
        a.gender.localeCompare(b.gender) ||
        a.name.localeCompare(b.name),
    );
}

export async function listIntermediateTeachers(): Promise<IntermediateTeacherOption[]> {
  // Staff RLS hides other users' roles/profiles from the client, so load
  // teachers through the staff-by-role API (admin client) like other pickers.
  try {
    const profiles = await fetchProfilesByRole("teacher");
    return profiles.map((row) => ({
      id: row.id,
      fullName: row.full_name?.trim() || "Teacher account",
      phone: null,
    }));
  } catch (error) {
    fail(
      error instanceof Error ? error : { message: "Could not load teachers" },
      "Could not load teachers",
    );
  }
}

export async function listIntermediateSectionSubjectAssignments(): Promise<
  IntermediateSectionSubjectAssignment[]
> {
  const [assignmentResult, subjects, sections, teachers] = await Promise.all([
    supabase
      .from("intermediate_section_subjects")
      .select("id, section_id, subject_id, teacher_user_id")
      .order("created_at"),
    listIntermediateSubjects(true),
    listIntermediateSections(),
    listIntermediateTeachers(),
  ]);
  if (assignmentResult.error) {
    fail(assignmentResult.error, "Could not load subject assignments");
  }

  const subjectMap = new Map(subjects.map((row) => [row.id, row]));
  const sectionMap = new Map(sections.map((row) => [row.id, row]));
  const teacherMap = new Map(teachers.map((row) => [row.id, row]));

  return (assignmentResult.data ?? [])
    .map((row) => {
      const subject = subjectMap.get(row.subject_id);
      const section = sectionMap.get(row.section_id);
      const teacher = teacherMap.get(row.teacher_user_id);
      if (!subject || !section) return null;
      return {
        id: row.id,
        sectionId: row.section_id,
        subjectId: row.subject_id,
        teacherUserId: row.teacher_user_id,
        sectionLabel: `${section.programName} · ${
          section.gender === "girls" ? "Girls" : "Boys"
        } — ${section.name}`,
        subjectLabel: `${subject.code} · ${subject.name}`,
        teacherName: teacher?.fullName ?? "Teacher account",
        sessionLabel: section.sessionLabel,
        yearLevel: section.yearLevel,
      } satisfies IntermediateSectionSubjectAssignment;
    })
    .filter((row): row is IntermediateSectionSubjectAssignment => Boolean(row))
    .sort(
      (a, b) =>
        b.sessionLabel.localeCompare(a.sessionLabel) ||
        a.yearLevel - b.yearLevel ||
        a.sectionLabel.localeCompare(b.sectionLabel) ||
        a.subjectLabel.localeCompare(b.subjectLabel),
    );
}

export async function listMyIntermediateSubjectAssignments(
  teacherUserId: string,
): Promise<MyIntermediateSubjectAssignment[]> {
  const { data: assignments, error } = await supabase
    .from("intermediate_section_subjects")
    .select("id, section_id, subject_id")
    .eq("teacher_user_id", teacherUserId)
    .order("created_at");
  if (error) fail(error, "Could not load your subject assignments");
  if (!assignments?.length) return [];

  const sectionIds = [...new Set(assignments.map((row) => row.section_id))];
  const subjectIds = [...new Set(assignments.map((row) => row.subject_id))];
  const [{ data: sections, error: sectionError }, { data: subjects, error: subjectError }] =
    await Promise.all([
      supabase
        .from("sections")
        .select(
          "id, name, gender, session_id, academic_sessions(label), classes(year_level)",
        )
        .in("id", sectionIds),
      supabase
        .from("intermediate_subjects")
        .select("id, code, name")
        .in("id", subjectIds)
        .eq("is_active", true),
    ]);
  if (sectionError) fail(sectionError, "Could not load assigned sections");
  if (subjectError) fail(subjectError, "Could not load assigned subjects");

  const sectionMap = new Map((sections ?? []).map((row) => [row.id, row]));
  const subjectMap = new Map((subjects ?? []).map((row) => [row.id, row]));

  return assignments
    .map((assignment) => {
      const section = sectionMap.get(assignment.section_id);
      const subject = subjectMap.get(assignment.subject_id);
      const session = section?.academic_sessions as { label?: string } | null;
      const classRow = section?.classes as { year_level?: number } | null;
      if (!section?.session_id || !subject || !classRow?.year_level) return null;

      return {
        id: assignment.id,
        sectionId: section.id,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        sectionName: section.name,
        sectionGender: section.gender as "boys" | "girls",
        sessionId: section.session_id,
        sessionLabel: session?.label ?? "Session",
        yearLevel: classRow.year_level,
      } satisfies MyIntermediateSubjectAssignment;
    })
    .filter((row): row is MyIntermediateSubjectAssignment => Boolean(row))
    .sort(
      (a, b) =>
        b.sessionLabel.localeCompare(a.sessionLabel) ||
        a.yearLevel - b.yearLevel ||
        a.sectionName.localeCompare(b.sectionName) ||
        a.subjectName.localeCompare(b.subjectName),
    );
}

export async function saveIntermediateSectionSubject(input: {
  sectionId: string;
  subjectId: string;
  teacherUserId: string;
  createdBy?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("intermediate_section_subjects").upsert(
    {
      section_id: input.sectionId,
      subject_id: input.subjectId,
      teacher_user_id: input.teacherUserId,
      created_by: input.createdBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "section_id,subject_id" },
  );
  if (error) fail(error, "Could not save section subject");
}

export async function deleteIntermediateSectionSubject(id: string): Promise<void> {
  const { error } = await supabase.from("intermediate_section_subjects").delete().eq("id", id);
  if (error) fail(error, "Could not remove section subject");
}
