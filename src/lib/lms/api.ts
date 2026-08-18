import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";
import { lmsDb } from "@/lib/lms/client";
import type {
  LmsCampusDayOff,
  LmsClassGroup,
  LmsCourse,
  LmsCourseOffering,
  LmsDashboardData,
  LmsDepartment,
  LmsLectureDelivery,
  LmsLectureSessionType,
  LmsLookup,
  LmsMyOffering,
  LmsOfferingStudent,
  LmsSemester,
  LmsSemesterStatus,
  LmsTeacherAssignment,
  LmsTeacherCandidate,
  LmsTeacherLeave,
  LmsTeacherProfile,
} from "@/lib/lms/types";

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function fetchLmsDashboard(): Promise<LmsDashboardData> {
  const [departments, semesters, courses, teachers, offerings, enrollments, current] =
    await Promise.all([
      lmsDb
        .from("lms_departments")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      lmsDb
        .from("lms_semester_instances")
        .select("id", { count: "exact", head: true })
        .in("status", ["admission_open", "running"]),
      lmsDb.from("lms_courses").select("id", { count: "exact", head: true }).eq("status", "active"),
      lmsDb
        .from("lms_teacher_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_active", true),
      lmsDb
        .from("lms_course_offerings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      lmsDb
        .from("lms_student_semester_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      lmsDb
        .from("lms_semester_instances")
        .select("*")
        .in("status", ["admission_open", "running"])
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(6),
    ]);

  const firstError = [
    departments.error,
    semesters.error,
    courses.error,
    teachers.error,
    offerings.error,
    enrollments.error,
    current.error,
  ].find(Boolean);
  if (firstError) fail(firstError, "Could not load LMS dashboard");

  return {
    departments: departments.count ?? 0,
    activeSemesters: semesters.count ?? 0,
    courses: courses.count ?? 0,
    teachers: teachers.count ?? 0,
    classGroups: 0,
    offerings: offerings.count ?? 0,
    enrolledStudents: enrollments.count ?? 0,
    currentSemesters: current.data ?? [],
  };
}

export async function listDepartments(): Promise<LmsDepartment[]> {
  const { data, error } = await lmsDb.from("lms_departments").select("*").order("name");
  if (error) fail(error, "Could not load departments");
  return data ?? [];
}

export async function createDepartment(
  input: Pick<LmsDepartment, "name" | "code" | "semester_count" | "hod_user_id">,
): Promise<LmsDepartment> {
  const { data, error } = await lmsDb.from("lms_departments").insert(input).select("*").single();
  if (error) fail(error, "Could not create department");
  return data;
}

export async function updateDepartment(
  id: string,
  input: Partial<
    Pick<LmsDepartment, "name" | "code" | "semester_count" | "hod_user_id" | "is_active">
  >,
): Promise<LmsDepartment> {
  const { data, error } = await lmsDb
    .from("lms_departments")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail(error, "Could not update department");
  return data;
}

export async function listSemesters(): Promise<LmsSemester[]> {
  const { data, error } = await lmsDb
    .from("lms_semester_instances")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail(error, "Could not load semesters");
  return data ?? [];
}

export async function createSemester(
  input: Pick<
    LmsSemester,
    | "department_id"
    | "academic_session_id"
    | "semester_number"
    | "name"
    | "start_date"
    | "end_date"
  >,
): Promise<LmsSemester> {
  const { data, error } = await lmsDb
    .from("lms_semester_instances")
    .insert(input)
    .select("*")
    .single();
  if (error) fail(error, "Could not create semester");
  return data;
}

export async function setSemesterStatus(id: string, status: LmsSemesterStatus): Promise<void> {
  const { error } = await lmsDb.rpc("lms_set_semester_status", {
    p_semester_id: id,
    p_status: status,
  });
  if (error) fail(error, "Could not update semester status");
}

export async function enrollBsStudentOnAdmission(studentId: string): Promise<string> {
  const { data, error } = await lmsDb.rpc("lms_enroll_bs_admission", {
    p_student_id: studentId,
    p_class_group_id: null,
  });
  if (error) fail(error, "Could not enroll BS student in Semester 1");
  return data as string;
}

export type CloseAndPromoteResult = {
  promoted: number;
  skipped: number;
  graduated: number;
  final_semester: boolean;
  from_semester_id?: string;
  to_semester_id?: string;
};

export async function closeAndPromoteSemester(
  fromSemesterId: string,
  toSemesterId: string | null,
): Promise<CloseAndPromoteResult> {
  // Final semester: pass from id twice; RPC ignores target when final.
  const { data, error } = await lmsDb.rpc("lms_close_and_promote_semester", {
    p_from_semester_id: fromSemesterId,
    p_to_semester_id: toSemesterId ?? fromSemesterId,
  });
  if (error) fail(error, "Could not close and promote semester");
  return data as CloseAndPromoteResult;
}

export async function listCourses(): Promise<LmsCourse[]> {
  const { data, error } = await lmsDb.from("lms_courses").select("*").order("code");
  if (error) fail(error, "Could not load courses");
  return data ?? [];
}

export async function createCourse(
  input: Pick<
    LmsCourse,
    | "department_id"
    | "code"
    | "name"
    | "credit_hours"
    | "theory_hours"
    | "lab_hours"
    | "lecture_count"
    | "lab_count"
    | "recommended_book"
    | "author"
    | "publisher"
    | "course_outline"
    | "learning_outcomes"
  >,
): Promise<LmsCourse> {
  const { data, error } = await lmsDb.from("lms_courses").insert(input).select("*").single();
  if (error) fail(error, "Could not create course");
  return data;
}

export async function updateCourseStatus(id: string, status: LmsCourse["status"]): Promise<void> {
  const { error } = await lmsDb.from("lms_courses").update({ status }).eq("id", id);
  if (error) fail(error, "Could not update course");
}

export async function listTeacherProfiles(): Promise<LmsTeacherProfile[]> {
  const { data, error } = await lmsDb
    .from("lms_teacher_profiles")
    .select("*")
    .order("employee_code");
  if (error) fail(error, "Could not load teachers");
  return data ?? [];
}

export async function saveTeacherProfile(
  input: Pick<LmsTeacherProfile, "user_id"> & Partial<LmsTeacherProfile>,
): Promise<void> {
  const { error } = await lmsDb
    .from("lms_teacher_profiles")
    .upsert(input, { onConflict: "user_id" });
  if (error) fail(error, "Could not save teacher profile");
}

export async function listClassGroups(): Promise<LmsClassGroup[]> {
  const { data, error } = await lmsDb
    .from("lms_class_groups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail(error, "Could not load classes");
  return data ?? [];
}

export async function createClassGroup(
  input: Pick<LmsClassGroup, "semester_instance_id" | "name" | "shift" | "room" | "capacity">,
): Promise<LmsClassGroup> {
  const { data, error } = await lmsDb.from("lms_class_groups").insert(input).select("*").single();
  if (error) fail(error, "Could not create class");
  return data;
}

export async function listOfferings(): Promise<LmsCourseOffering[]> {
  const { data, error } = await lmsDb
    .from("lms_course_offerings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) fail(error, "Could not load offerings");
  return data ?? [];
}

export async function createOffering(
  input: Pick<LmsCourseOffering, "semester_instance_id" | "course_id"> &
    Partial<Pick<LmsCourseOffering, "capacity">>,
  teacherUserId?: string | null,
): Promise<LmsCourseOffering> {
  const { data, error } = await lmsDb
    .from("lms_course_offerings")
    .insert({
      semester_instance_id: input.semester_instance_id,
      course_id: input.course_id,
      capacity: input.capacity ?? null,
      class_group_id: null,
      section_code: null,
    })
    .select("*")
    .single();
  if (error) fail(error, "Could not create offering");

  if (teacherUserId) {
    const { error: assignmentError } = await lmsDb.from("lms_teacher_assignments").insert({
      offering_id: data.id,
      teacher_user_id: teacherUserId,
      is_primary: true,
    });
    if (assignmentError) fail(assignmentError, "Offering created but teacher assignment failed");
  }
  return data;
}

export async function listPrimaryTeachersByOffering(): Promise<Record<string, string>> {
  const { data, error } = await lmsDb
    .from("lms_teacher_assignments")
    .select("offering_id, teacher_user_id")
    .eq("is_primary", true);
  if (error) fail(error, "Could not load teacher assignments");
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.offering_id] = row.teacher_user_id;
  }
  return map;
}

async function setPrimaryTeacher(offeringId: string, teacherUserId: string | null): Promise<void> {
  const { error: clearError } = await lmsDb
    .from("lms_teacher_assignments")
    .delete()
    .eq("offering_id", offeringId)
    .eq("is_primary", true);
  if (clearError) fail(clearError, "Could not update teacher assignment");

  if (!teacherUserId) return;

  const { error: assignError } = await lmsDb.from("lms_teacher_assignments").insert({
    offering_id: offeringId,
    teacher_user_id: teacherUserId,
    is_primary: true,
  });
  if (assignError) fail(assignError, "Could not assign teacher");
}

export async function updateOffering(
  id: string,
  input: Partial<Pick<LmsCourseOffering, "capacity" | "status">>,
  teacherUserId?: string | null,
): Promise<LmsCourseOffering> {
  const patch: Partial<Pick<LmsCourseOffering, "capacity" | "status">> = {};
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.status !== undefined) patch.status = input.status;

  let data: LmsCourseOffering | null = null;
  if (Object.keys(patch).length > 0) {
    const result = await lmsDb
      .from("lms_course_offerings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (result.error) fail(result.error, "Could not update offering");
    data = result.data;
  } else {
    const result = await lmsDb.from("lms_course_offerings").select("*").eq("id", id).single();
    if (result.error) fail(result.error, "Could not load offering");
    data = result.data;
  }

  if (teacherUserId !== undefined) {
    await setPrimaryTeacher(id, teacherUserId);
  }
  return data;
}

export async function dropOffering(id: string): Promise<void> {
  const { error: enrollError } = await lmsDb
    .from("lms_course_enrollments")
    .delete()
    .eq("offering_id", id);
  if (enrollError) fail(enrollError, "Could not remove course enrollments for this offering");

  const { error } = await lmsDb.from("lms_course_offerings").delete().eq("id", id);
  if (error) fail(error, "Could not drop offering");
}

export async function listAcademicSessions(): Promise<LmsLookup[]> {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id, label, program_type, is_active, start_year")
    .eq("program_type", "bs")
    .order("start_year", { ascending: false });
  if (error) fail(error, "Could not load academic sessions");
  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${row.label}${row.is_active ? " (running)" : ""}`,
  }));
}

export async function listBsPrograms(): Promise<LmsLookup[]> {
  const { data, error } = await supabase
    .from("programs")
    .select("id, name")
    .eq("type", "bs")
    .order("name");
  if (error) fail(error, "Could not load BS programs");
  return (data ?? []).map((row) => ({ id: row.id, label: row.name }));
}

export async function listStaffCandidates(
  role: Extract<AppRole, "teacher" | "hod" | "bs_coordinator">,
): Promise<LmsTeacherCandidate[]> {
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", role);
  if (rolesError) fail(rolesError, `Could not load ${role} accounts`);

  const ids = [...new Set((roles ?? []).map((row) => row.user_id))];
  if (!ids.length) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", ids)
    .order("full_name");
  if (error) fail(error, "Could not load teacher accounts");

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name || "Teacher account",
    phone: profile.phone,
  }));
}

export function listTeacherCandidates(): Promise<LmsTeacherCandidate[]> {
  return listStaffCandidates("teacher");
}

export function listBsCoordinatorCandidates(): Promise<LmsTeacherCandidate[]> {
  return listStaffCandidates("bs_coordinator");
}

export async function listMyOfferings(sessionId?: string | null): Promise<LmsMyOffering[]> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return [];

  const { data: assignments, error } = await lmsDb
    .from("lms_teacher_assignments")
    .select("id, offering_id, is_primary")
    .eq("teacher_user_id", uid);
  if (error) fail(error, "Could not load your BS class assignments");
  if (!assignments?.length) return [];

  const offeringIds = assignments.map((row) => row.offering_id);
  const { data: offerings, error: offeringsError } = await lmsDb
    .from("lms_course_offerings")
    .select("id, course_id, semester_instance_id")
    .in("id", offeringIds);
  if (offeringsError) fail(offeringsError, "Could not load your course offerings");

  const courseIds = [...new Set((offerings ?? []).map((row) => row.course_id))];
  const semesterIds = [...new Set((offerings ?? []).map((row) => row.semester_instance_id))];
  if (!courseIds.length || !semesterIds.length) return [];

  const [courses, semesters, enrollments] = await Promise.all([
    lmsDb.from("lms_courses").select("id, code, name").in("id", courseIds),
    lmsDb
      .from("lms_semester_instances")
      .select("id, name, semester_number, status, academic_session_id")
      .in("id", semesterIds),
    lmsDb
      .from("lms_course_enrollments")
      .select("offering_id")
      .in("offering_id", offeringIds)
      .eq("status", "active"),
  ]);

  if (courses.error) fail(courses.error, "Could not load courses");
  if (semesters.error) fail(semesters.error, "Could not load semesters");
  if (enrollments.error) fail(enrollments.error, "Could not load enrollments");

  const sessionIds = [
    ...new Set((semesters.data ?? []).map((row) => row.academic_session_id).filter(Boolean)),
  ];
  const sessions =
    sessionIds.length === 0
      ? { data: [] as { id: string; label: string }[], error: null }
      : await supabase.from("academic_sessions").select("id, label").in("id", sessionIds);
  if (sessions.error) fail(sessions.error, "Could not load sessions");

  const courseMap = new Map((courses.data ?? []).map((row) => [row.id, row]));
  const semesterMap = new Map((semesters.data ?? []).map((row) => [row.id, row]));
  const sessionMap = new Map((sessions.data ?? []).map((row) => [row.id, row.label]));
  const offeringMap = new Map((offerings ?? []).map((row) => [row.id, row]));
  const countMap = new Map<string, number>();
  for (const row of enrollments.data ?? []) {
    countMap.set(row.offering_id, (countMap.get(row.offering_id) ?? 0) + 1);
  }

  return assignments
    .map((assignment) => {
      const offering = offeringMap.get(assignment.offering_id);
      if (!offering) return null;
      const semester = semesterMap.get(offering.semester_instance_id);
      if (!semester) return null;
      if (sessionId && semester.academic_session_id !== sessionId) return null;
      const course = courseMap.get(offering.course_id);
      return {
        assignmentId: assignment.id,
        offeringId: offering.id,
        isPrimary: assignment.is_primary,
        courseCode: course?.code ?? "—",
        courseName: course?.name ?? "Course",
        semesterId: semester.id,
        semesterName: semester.name,
        semesterNumber: semester.semester_number,
        semesterStatus: semester.status,
        academicSessionId: semester.academic_session_id,
        sessionLabel: sessionMap.get(semester.academic_session_id) ?? "Session",
        studentCount: countMap.get(offering.id) ?? 0,
      } satisfies LmsMyOffering;
    })
    .filter((row): row is LmsMyOffering => Boolean(row))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

export async function listStudentsForOffering(offeringId: string): Promise<LmsOfferingStudent[]> {
  const { data: enrollments, error } = await lmsDb
    .from("lms_course_enrollments")
    .select("id, semester_enrollment_id, status")
    .eq("offering_id", offeringId)
    .eq("status", "active");
  if (error) fail(error, "Could not load offering students");
  if (!enrollments?.length) return [];

  const semesterEnrollmentIds = enrollments.map((row) => row.semester_enrollment_id);
  const { data: semesterEnrollments, error: semesterError } = await lmsDb
    .from("lms_student_semester_enrollments")
    .select("id, student_id, registration_number")
    .in("id", semesterEnrollmentIds);
  if (semesterError) fail(semesterError, "Could not load semester enrollments");

  const studentIds = [...new Set((semesterEnrollments ?? []).map((row) => row.student_id))];
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, full_name, roll_number")
    .in("id", studentIds)
    .order("full_name");
  if (studentsError) fail(studentsError, "Could not load students");

  const semesterMap = new Map((semesterEnrollments ?? []).map((row) => [row.id, row]));
  const studentMap = new Map((students ?? []).map((row) => [row.id, row]));

  return enrollments
    .map((enrollment) => {
      const semesterEnrollment = semesterMap.get(enrollment.semester_enrollment_id);
      if (!semesterEnrollment) return null;
      const student = studentMap.get(semesterEnrollment.student_id);
      if (!student) return null;
      return {
        enrollmentId: enrollment.id,
        studentId: student.id,
        fullName: student.full_name,
        rollNumber: student.roll_number,
        registrationNumber: semesterEnrollment.registration_number,
        status: enrollment.status,
      } satisfies LmsOfferingStudent;
    })
    .filter((row): row is LmsOfferingStudent => Boolean(row))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function listTeacherAssignments(): Promise<LmsTeacherAssignment[]> {
  const { data, error } = await lmsDb.from("lms_teacher_assignments").select("*");
  if (error) fail(error, "Could not load teacher assignments");
  return data ?? [];
}

export async function listTeacherDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return {};
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) fail(error, "Could not load teacher names");
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id] = row.full_name || "Teacher";
  }
  return map;
}

export async function updateSemesterCoordinator(
  semesterId: string,
  coordinatorUserId: string | null,
): Promise<void> {
  const { error } = await lmsDb
    .from("lms_semester_instances")
    .update({ coordinator_user_id: coordinatorUserId })
    .eq("id", semesterId);
  if (error) fail(error, "Could not update semester coordinator");
}

export async function listCampusDayOffs(): Promise<LmsCampusDayOff[]> {
  const { data, error } = await lmsDb
    .from("lms_campus_day_offs")
    .select("*")
    .order("off_date", { ascending: false });
  if (error) fail(error, "Could not load campus day offs");
  return data ?? [];
}

export async function createCampusDayOff(offDate: string, reason?: string | null): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await lmsDb.from("lms_campus_day_offs").insert({
    off_date: offDate,
    reason: reason?.trim() || null,
    created_by: userRes.user?.id ?? null,
  });
  if (error) fail(error, "Could not save campus day off");
}

export async function deleteCampusDayOff(id: string): Promise<void> {
  const { error } = await lmsDb.from("lms_campus_day_offs").delete().eq("id", id);
  if (error) fail(error, "Could not remove campus day off");
}

export async function listTeacherLeaves(from?: string, to?: string): Promise<LmsTeacherLeave[]> {
  let query = lmsDb.from("lms_teacher_leaves").select("*").order("leave_date", { ascending: false });
  if (from) query = query.gte("leave_date", from);
  if (to) query = query.lte("leave_date", to);
  const { data, error } = await query;
  if (error) fail(error, "Could not load teacher leaves");
  return data ?? [];
}

export async function createTeacherLeave(
  teacherUserId: string,
  leaveDate: string,
  reason?: string | null,
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await lmsDb.from("lms_teacher_leaves").insert({
    teacher_user_id: teacherUserId,
    leave_date: leaveDate,
    reason: reason?.trim() || null,
    created_by: userRes.user?.id ?? null,
  });
  if (error) fail(error, "Could not save teacher leave");
}

export async function deleteTeacherLeave(id: string): Promise<void> {
  const { error } = await lmsDb.from("lms_teacher_leaves").delete().eq("id", id);
  if (error) fail(error, "Could not remove teacher leave");
}

export async function listLectureDeliveries(args: {
  from?: string;
  to?: string;
  semesterId?: string;
  offeringIds?: string[];
}): Promise<LmsLectureDelivery[]> {
  let offeringIds = args.offeringIds;
  if (args.semesterId && !offeringIds) {
    const { data: offerings, error: offeringsError } = await lmsDb
      .from("lms_course_offerings")
      .select("id")
      .eq("semester_instance_id", args.semesterId);
    if (offeringsError) fail(offeringsError, "Could not load offerings for deliveries");
    offeringIds = (offerings ?? []).map((o) => o.id);
    if (!offeringIds.length) return [];
  }

  let query = lmsDb.from("lms_lecture_deliveries").select("*").order("delivery_date", {
    ascending: false,
  });
  if (args.from) query = query.gte("delivery_date", args.from);
  if (args.to) query = query.lte("delivery_date", args.to);
  if (offeringIds?.length) query = query.in("offering_id", offeringIds);

  const { data, error } = await query;
  if (error) fail(error, "Could not load lecture deliveries");
  return data ?? [];
}

export async function setLectureDelivery(input: {
  offeringId: string;
  teacherUserId: string;
  deliveryDate: string;
  sessionType: LmsLectureSessionType;
  delivered: boolean;
}): Promise<void> {
  if (!input.delivered) {
    const { error } = await lmsDb
      .from("lms_lecture_deliveries")
      .delete()
      .eq("offering_id", input.offeringId)
      .eq("teacher_user_id", input.teacherUserId)
      .eq("delivery_date", input.deliveryDate)
      .eq("session_type", input.sessionType);
    if (error) fail(error, "Could not remove lecture mark");
    return;
  }

  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await lmsDb.from("lms_lecture_deliveries").upsert(
    {
      offering_id: input.offeringId,
      teacher_user_id: input.teacherUserId,
      delivery_date: input.deliveryDate,
      session_type: input.sessionType,
      marked_by: userRes.user?.id ?? null,
    },
    { onConflict: "offering_id,teacher_user_id,delivery_date,session_type" },
  );
  if (error) fail(error, "Could not mark lecture delivery");
}

export type LmsSemesterDeliverySubject = {
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  teacherUserId: string | null;
  hasTheory: boolean;
  hasLab: boolean;
};

/** Active semester offerings (subjects) with primary teacher when assigned — for lecture marks. */
export async function listAssignmentsForSemester(
  semesterId: string,
): Promise<LmsSemesterDeliverySubject[]> {
  const { data: offerings, error: offeringsError } = await lmsDb
    .from("lms_course_offerings")
    .select("id, course_id")
    .eq("semester_instance_id", semesterId)
    .eq("status", "active");
  if (offeringsError) fail(offeringsError, "Could not load semester offerings");
  if (!offerings?.length) return [];

  const offeringIds = offerings.map((o) => o.id);
  const courseIds = [...new Set(offerings.map((o) => o.course_id))];

  const [{ data: assignments, error: assignmentsError }, { data: courses, error: coursesError }] =
    await Promise.all([
      lmsDb
        .from("lms_teacher_assignments")
        .select("offering_id, teacher_user_id, is_primary")
        .in("offering_id", offeringIds),
      lmsDb
        .from("lms_courses")
        .select("id, code, name, theory_hours, lab_hours")
        .in("id", courseIds),
    ]);
  if (assignmentsError) fail(assignmentsError, "Could not load assignments");
  if (coursesError) fail(coursesError, "Could not load courses");

  const courseMap = new Map((courses ?? []).map((c) => [c.id, c]));
  const teacherByOffering = new Map<string, string>();
  for (const a of assignments ?? []) {
    if (a.is_primary) teacherByOffering.set(a.offering_id, a.teacher_user_id);
  }
  for (const a of assignments ?? []) {
    if (!teacherByOffering.has(a.offering_id)) {
      teacherByOffering.set(a.offering_id, a.teacher_user_id);
    }
  }

  return offerings
    .map((offering) => {
      const course = courseMap.get(offering.course_id);
      if (!course) return null;
      const theoryHours = Number(course.theory_hours ?? 0);
      const labHours = Number(course.lab_hours ?? 0);
      return {
        offeringId: offering.id,
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        teacherUserId: teacherByOffering.get(offering.id) ?? null,
        hasTheory: theoryHours > 0 || labHours <= 0,
        hasLab: labHours > 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}
