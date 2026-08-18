export type LmsSemesterStatus = "preparing" | "admission_open" | "running" | "closed" | "archived";

export type LmsCourseStatus = "active" | "inactive" | "archived";
export type LmsEmploymentType = "permanent" | "visiting" | "contract";
export type LmsPayBasis = "fixed_salary" | "lecture_wise" | "hourly";
export type LmsShift = "morning" | "evening" | "weekend";
export type LmsEnrollmentStatus = "active" | "completed" | "withdrawn" | "failed" | "frozen";

export type LmsDepartment = {
  id: string;
  name: string;
  code: string;
  hod_user_id: string | null;
  semester_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsSemester = {
  id: string;
  department_id: string;
  program_id: string;
  academic_session_id: string;
  semester_number: number;
  name: string;
  status: LmsSemesterStatus;
  start_date: string | null;
  end_date: string | null;
  coordinator_user_id: string | null;
  created_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsCourse = {
  id: string;
  department_id: string;
  code: string;
  name: string;
  credit_hours: number;
  theory_hours: number;
  lab_hours: number;
  lecture_count: number;
  lab_count: number;
  recommended_book: string | null;
  author: string | null;
  publisher: string | null;
  course_outline: string | null;
  learning_outcomes: string[];
  status: LmsCourseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsTeacherProfile = {
  user_id: string;
  department_id: string | null;
  employee_code: string | null;
  photo_path: string | null;
  qualification: string | null;
  experience_years: number;
  specialization: string | null;
  cnic: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  employment_type: LmsEmploymentType;
  pay_basis: LmsPayBasis;
  fixed_salary: number;
  per_lecture_rate: number;
  hourly_rate: number;
  is_active: boolean;
  hired_on: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsClassGroup = {
  id: string;
  semester_instance_id: string;
  section_id: string | null;
  name: string;
  shift: LmsShift;
  room: string | null;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LmsCourseOffering = {
  id: string;
  semester_instance_id: string;
  class_group_id: string | null;
  course_id: string;
  section_code: string | null;
  capacity: number | null;
  status: LmsCourseStatus;
  created_at: string;
  updated_at: string;
};

export type LmsTeacherAssignment = {
  id: string;
  offering_id: string;
  teacher_user_id: string;
  is_primary: boolean;
  assigned_by: string | null;
  assigned_at: string;
};

export type LmsSalaryLectureEntry = {
  id: string;
  offering_id: string;
  teacher_user_id: string;
  period_key: string;
  lectures_delivered: number;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsLectureSessionType = "theory" | "lab";

export type LmsCampusDayOff = {
  id: string;
  off_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type LmsTeacherLeave = {
  id: string;
  teacher_user_id: string;
  leave_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type LmsLectureDelivery = {
  id: string;
  offering_id: string;
  teacher_user_id: string;
  delivery_date: string;
  session_type: LmsLectureSessionType;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
};

export type LmsSemesterEnrollment = {
  id: string;
  student_id: string;
  semester_instance_id: string;
  class_group_id: string | null;
  registration_number: string | null;
  status: LmsEnrollmentStatus;
  enrolled_on: string;
  completed_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsCourseEnrollment = {
  id: string;
  semester_enrollment_id: string;
  offering_id: string;
  status: LmsEnrollmentStatus;
  enrolled_at: string;
};

export type LmsDashboardData = {
  departments: number;
  activeSemesters: number;
  courses: number;
  teachers: number;
  classGroups: number;
  offerings: number;
  enrolledStudents: number;
  currentSemesters: LmsSemester[];
};

export type LmsLookup = {
  id: string;
  label: string;
};

export type LmsTeacherCandidate = {
  id: string;
  fullName: string;
  phone: string | null;
};

export type LmsMyOffering = {
  assignmentId: string;
  offeringId: string;
  isPrimary: boolean;
  courseCode: string;
  courseName: string;
  semesterId: string;
  semesterName: string;
  semesterNumber: number;
  semesterStatus: LmsSemesterStatus;
  academicSessionId: string;
  sessionLabel: string;
  studentCount: number;
};

export type LmsOfferingStudent = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  rollNumber: string | null;
  registrationNumber: string | null;
  status: LmsEnrollmentStatus;
};
