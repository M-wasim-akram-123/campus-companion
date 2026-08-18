import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null);

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Department name is required").max(120),
  code: z
    .string()
    .trim()
    .min(2, "Department code is required")
    .max(12)
    .transform((value) => value.toUpperCase()),
  semester_count: z.coerce.number().int().min(1).max(16),
  hod_user_id: optionalText,
});

export const semesterSchema = z
  .object({
    department_id: z.string().uuid("Select a department"),
    academic_session_id: z.string().uuid("Select an academic session"),
    semester_number: z.coerce.number().int().min(1).max(16),
    name: z.string().trim().min(2, "Semester name is required").max(120),
    start_date: optionalText,
    end_date: optionalText,
  })
  .refine((value) => !value.start_date || !value.end_date || value.end_date >= value.start_date, {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

export const courseSchema = z.object({
  department_id: z.string().uuid("Select a department"),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Course name is required").max(180),
  credit_hours: z.coerce.number().positive().max(12),
  theory_hours: z.coerce.number().min(0).max(12),
  lab_hours: z.coerce.number().min(0).max(12),
  lecture_count: z.coerce.number().int().min(0).max(500),
  lab_count: z.coerce.number().int().min(0).max(500),
  recommended_book: optionalText,
  author: optionalText,
  publisher: optionalText,
  course_outline: optionalText,
  learning_outcomes_text: z.string().optional(),
});

export const teacherProfileSchema = z.object({
  user_id: z.string().uuid("Select a teacher account"),
  department_id: z.string().uuid("Select a department"),
  employee_code: z.string().trim().min(1, "Employee code is required").max(40),
  qualification: optionalText,
  specialization: optionalText,
  cnic: optionalText,
  phone: optionalText,
  email: z.union([z.string().trim().email(), z.literal("")]).transform((value) => value || null),
  address: optionalText,
  experience_years: z.coerce.number().min(0).max(80),
  employment_type: z.enum(["permanent", "visiting", "contract"]),
  pay_basis: z.enum(["fixed_salary", "lecture_wise", "hourly"]),
  fixed_salary: z.coerce.number().min(0),
  per_lecture_rate: z.coerce.number().min(0),
  hourly_rate: z.coerce.number().min(0),
  hired_on: optionalText,
});

export const classGroupSchema = z.object({
  semester_instance_id: z.string().uuid("Select a semester"),
  name: z.string().trim().min(2, "Class name is required").max(60),
  shift: z.enum(["morning", "evening", "weekend"]),
  room: optionalText,
  capacity: z.coerce.number().int().positive().max(500),
});

export const offeringSchema = z.object({
  semester_instance_id: z.string().uuid("Select a semester"),
  course_id: z.string().uuid("Select a course"),
  teacher_user_id: z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null),
  capacity: z.coerce.number().int().positive().max(500).optional().nullable(),
});

export const updateOfferingSchema = z.object({
  teacher_user_id: z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null),
  capacity: z.coerce.number().int().positive().max(500).optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]),
});
