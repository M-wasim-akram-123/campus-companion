import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
  LmsCampusDayOff,
  LmsClassGroup,
  LmsCourse,
  LmsCourseEnrollment,
  LmsCourseOffering,
  LmsDepartment,
  LmsLectureDelivery,
  LmsSalaryLectureEntry,
  LmsSemester,
  LmsSemesterEnrollment,
  LmsTeacherAssignment,
  LmsTeacherLeave,
  LmsTeacherProfile,
} from "@/lib/lms/types";

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type LmsDatabase = {
  public: {
    Tables: {
      lms_departments: Table<
        LmsDepartment,
        Pick<LmsDepartment, "name" | "code"> &
          Partial<
            Pick<LmsDepartment, "hod_user_id" | "semester_count" | "is_active" | "created_by">
          >
      >;
      lms_department_programs: Table<{
        department_id: string;
        program_id: string;
        created_at: string;
      }>;
      lms_semester_instances: Table<
        LmsSemester,
        Pick<
          LmsSemester,
          "department_id" | "academic_session_id" | "semester_number" | "name"
        > &
          Partial<
            Pick<
              LmsSemester,
              | "program_id"
              | "status"
              | "start_date"
              | "end_date"
              | "coordinator_user_id"
              | "created_by"
            >
          >
      >;
      lms_courses: Table<
        LmsCourse,
        Pick<LmsCourse, "department_id" | "code" | "name" | "credit_hours"> &
          Partial<
            Pick<
              LmsCourse,
              | "theory_hours"
              | "lab_hours"
              | "lecture_count"
              | "lab_count"
              | "recommended_book"
              | "author"
              | "publisher"
              | "course_outline"
              | "learning_outcomes"
              | "status"
              | "created_by"
            >
          >
      >;
      lms_teacher_profiles: Table<
        LmsTeacherProfile,
        Pick<LmsTeacherProfile, "user_id"> &
          Partial<
            Pick<
              LmsTeacherProfile,
              | "department_id"
              | "employee_code"
              | "qualification"
              | "experience_years"
              | "specialization"
              | "cnic"
              | "phone"
              | "email"
              | "address"
              | "employment_type"
              | "pay_basis"
              | "fixed_salary"
              | "per_lecture_rate"
              | "hourly_rate"
              | "is_active"
              | "hired_on"
            >
          >
      >;
      lms_class_groups: Table<
        LmsClassGroup,
        Pick<LmsClassGroup, "semester_instance_id" | "name"> &
          Partial<Pick<LmsClassGroup, "section_id" | "shift" | "room" | "capacity" | "is_active">>
      >;
      lms_course_offerings: Table<
        LmsCourseOffering,
        Pick<LmsCourseOffering, "semester_instance_id" | "course_id"> &
          Partial<Pick<LmsCourseOffering, "class_group_id" | "section_code" | "capacity" | "status">>
      >;
      lms_teacher_assignments: Table<
        LmsTeacherAssignment,
        Pick<LmsTeacherAssignment, "offering_id" | "teacher_user_id"> &
          Partial<Pick<LmsTeacherAssignment, "is_primary" | "assigned_by">>
      >;
      lms_salary_lecture_entries: Table<
        LmsSalaryLectureEntry,
        Pick<LmsSalaryLectureEntry, "offering_id" | "teacher_user_id" | "period_key" | "lectures_delivered"> &
          Partial<Pick<LmsSalaryLectureEntry, "notes" | "updated_by">>
      >;
      lms_campus_day_offs: Table<
        LmsCampusDayOff,
        Pick<LmsCampusDayOff, "off_date"> & Partial<Pick<LmsCampusDayOff, "reason" | "created_by">>
      >;
      lms_teacher_leaves: Table<
        LmsTeacherLeave,
        Pick<LmsTeacherLeave, "teacher_user_id" | "leave_date"> &
          Partial<Pick<LmsTeacherLeave, "reason" | "created_by">>
      >;
      lms_lecture_deliveries: Table<
        LmsLectureDelivery,
        Pick<
          LmsLectureDelivery,
          "offering_id" | "teacher_user_id" | "delivery_date" | "session_type"
        > & Partial<Pick<LmsLectureDelivery, "marked_by" | "notes">>
      >;
      lms_student_semester_enrollments: Table<LmsSemesterEnrollment>;
      lms_course_enrollments: Table<LmsCourseEnrollment>;
    };
    Views: Record<string, never>;
    Functions: {
      lms_set_semester_status: {
        Args: { p_semester_id: string; p_status: LmsSemester["status"] };
        Returns: LmsSemester;
      };
      lms_enroll_bs_admission: {
        Args: { p_student_id: string; p_class_group_id?: string | null };
        Returns: string;
      };
      lms_close_and_promote_semester: {
        Args: { p_from_semester_id: string; p_to_semester_id: string };
        Returns: {
          promoted: number;
          skipped: number;
          graduated: number;
          final_semester: boolean;
          from_semester_id?: string;
          to_semester_id?: string;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const lmsDb = supabase as unknown as SupabaseClient<LmsDatabase>;
