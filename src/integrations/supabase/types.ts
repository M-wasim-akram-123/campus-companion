export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string
          end_year: number
          id: string
          is_active: boolean
          label: string
          start_year: number
        }
        Insert: {
          created_at?: string
          end_year: number
          id?: string
          is_active?: boolean
          label: string
          start_year: number
        }
        Update: {
          created_at?: string
          end_year?: number
          id?: string
          is_active?: boolean
          label?: string
          start_year?: number
        }
        Relationships: []
      }
      admission_fee_policies: {
        Row: {
          academic_session_id: string | null
          created_at: string
          default_admission_components:
            | Database["public"]["Enums"]["fee_component_type"][]
            | null
          default_installment_count: number
          default_schedule:
            | Database["public"]["Enums"]["annual_fee_schedule_type"]
            | null
          default_start_after_months: number
          id: string
          is_active: boolean
          name: string
          program_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          default_admission_components?:
            | Database["public"]["Enums"]["fee_component_type"][]
            | null
          default_installment_count?: number
          default_schedule?:
            | Database["public"]["Enums"]["annual_fee_schedule_type"]
            | null
          default_start_after_months?: number
          id?: string
          is_active?: boolean
          name: string
          program_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          default_admission_components?:
            | Database["public"]["Enums"]["fee_component_type"][]
            | null
          default_installment_count?: number
          default_schedule?:
            | Database["public"]["Enums"]["annual_fee_schedule_type"]
            | null
          default_start_after_months?: number
          id?: string
          is_active?: boolean
          name?: string
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_fee_policies_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_fee_policies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_number_counters: {
        Row: {
          academic_session_id: string
          last_number: number
        }
        Insert: {
          academic_session_id: string
          last_number?: number
        }
        Update: {
          academic_session_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "admission_number_counters_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: true
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          program_id: string
          year_level: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          program_id: string
          year_level: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          program_id?: string
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payment_allocations: {
        Row: {
          amount: number
          id: string
          installment_id: string | null
          payment_id: string
        }
        Insert: {
          amount: number
          id?: string
          installment_id?: string | null
          payment_id: string
        }
        Update: {
          amount?: number
          id?: string
          installment_id?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payment_allocations_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "student_fee_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "fee_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number: string
          recorded_by: string | null
          student_id: string
          voucher_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number: string
          recorded_by?: string | null
          student_id: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: string
          recorded_by?: string | null
          student_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "finance_defaulters"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "fee_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_policy_components: {
        Row: {
          amount: number
          component_type: Database["public"]["Enums"]["fee_component_type"]
          id: string
          policy_id: string
        }
        Insert: {
          amount?: number
          component_type: Database["public"]["Enums"]["fee_component_type"]
          id?: string
          policy_id: string
        }
        Update: {
          amount?: number
          component_type?: Database["public"]["Enums"]["fee_component_type"]
          id?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_policy_components_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "admission_fee_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_policy_installment_templates: {
        Row: {
          amount: number
          component_type:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          due_day: number | null
          due_months_after_admission: number
          id: string
          label: string
          policy_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          component_type?:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          due_day?: number | null
          due_months_after_admission?: number
          id?: string
          label: string
          policy_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          component_type?:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          due_day?: number | null
          due_months_after_admission?: number
          id?: string
          label?: string
          policy_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_policy_installment_templates_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "admission_fee_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_scholarship_slabs: {
        Row: {
          applies_to: Database["public"]["Enums"]["fee_component_type"]
          discount_percent: number
          id: string
          label: string | null
          max_percentage: number | null
          min_percentage: number
          policy_id: string
          sort_order: number
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["fee_component_type"]
          discount_percent?: number
          id?: string
          label?: string | null
          max_percentage?: number | null
          min_percentage: number
          policy_id: string
          sort_order?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["fee_component_type"]
          discount_percent?: number
          id?: string
          label?: string | null
          max_percentage?: number | null
          min_percentage?: number
          policy_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_scholarship_slabs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "admission_fee_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_voucher_lines: {
        Row: {
          amount: number
          id: string
          installment_id: string | null
          label: string
          sort_order: number
          voucher_id: string
        }
        Insert: {
          amount: number
          id?: string
          installment_id?: string | null
          label: string
          sort_order?: number
          voucher_id: string
        }
        Update: {
          amount?: number
          id?: string
          installment_id?: string | null
          label?: string
          sort_order?: number
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_voucher_lines_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "student_fee_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "fee_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_vouchers: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          issued_at: string
          notes: string | null
          paid_amount: number
          qr_token: string
          source: Database["public"]["Enums"]["voucher_source"]
          status: Database["public"]["Enums"]["voucher_status"]
          student_id: string
          total_amount: number
          updated_at: string
          voucher_number: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          issued_at?: string
          notes?: string | null
          paid_amount?: number
          qr_token?: string
          source?: Database["public"]["Enums"]["voucher_source"]
          status?: Database["public"]["Enums"]["voucher_status"]
          student_id: string
          total_amount: number
          updated_at?: string
          voucher_number: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issued_at?: string
          notes?: string | null
          paid_amount?: number
          qr_token?: string
          source?: Database["public"]["Enums"]["voucher_source"]
          status?: Database["public"]["Enums"]["voucher_status"]
          student_id?: string
          total_amount?: number
          updated_at?: string
          voucher_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_vouchers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "finance_defaulters"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "fee_vouchers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_counters: {
        Row: {
          counter_key: string
          last_number: number
          year: number
        }
        Insert: {
          counter_key: string
          last_number?: number
          year: number
        }
        Update: {
          counter_key?: string
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          assigned_to: string | null
          converted_student_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          father_name: string | null
          follow_up_date: string | null
          full_name: string
          gender: string | null
          id: string
          matric_marks_obtained: number | null
          matric_marks_total: number | null
          matric_school: string | null
          notes: string | null
          phone: string
          photo_url: string | null
          preferred_section_id: string | null
          program_id: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          converted_student_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          follow_up_date?: string | null
          full_name: string
          gender?: string | null
          id?: string
          matric_marks_obtained?: number | null
          matric_marks_total?: number | null
          matric_school?: string | null
          notes?: string | null
          phone: string
          photo_url?: string | null
          preferred_section_id?: string | null
          program_id?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          converted_student_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          father_name?: string | null
          follow_up_date?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          matric_marks_obtained?: number | null
          matric_marks_total?: number | null
          matric_school?: string | null
          notes?: string | null
          phone?: string
          photo_url?: string | null
          preferred_section_id?: string | null
          program_id?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_preferred_section_id_fkey"
            columns: ["preferred_section_id"]
            isOneToOne: false
            referencedRelation: "finance_section_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "inquiries_preferred_section_id_fkey"
            columns: ["preferred_section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          duration_years: number
          id: string
          name: string
          type: Database["public"]["Enums"]["program_type"]
        }
        Insert: {
          created_at?: string
          duration_years?: number
          id?: string
          name: string
          type: Database["public"]["Enums"]["program_type"]
        }
        Update: {
          created_at?: string
          duration_years?: number
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["program_type"]
        }
        Relationships: []
      }
      sections: {
        Row: {
          capacity: number | null
          class_id: string
          created_at: string
          gender: Database["public"]["Enums"]["section_gender"]
          id: string
          name: string
          session_id: string | null
        }
        Insert: {
          capacity?: number | null
          class_id: string
          created_at?: string
          gender?: Database["public"]["Enums"]["section_gender"]
          id?: string
          name: string
          session_id?: string | null
        }
        Update: {
          capacity?: number | null
          class_id?: string
          created_at?: string
          gender?: Database["public"]["Enums"]["section_gender"]
          id?: string
          name?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fee_installments: {
        Row: {
          amount: number
          component_type:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          created_at: string
          due_date: string
          fee_plan_id: string
          id: string
          label: string
          paid_amount: number
          sort_order: number
          status: string
          student_id: string
        }
        Insert: {
          amount: number
          component_type?:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          created_at?: string
          due_date: string
          fee_plan_id: string
          id?: string
          label: string
          paid_amount?: number
          sort_order?: number
          status?: string
          student_id: string
        }
        Update: {
          amount?: number
          component_type?:
            | Database["public"]["Enums"]["fee_component_type"]
            | null
          created_at?: string
          due_date?: string
          fee_plan_id?: string
          id?: string
          label?: string
          paid_amount?: number
          sort_order?: number
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_installments_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "student_fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_installments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "finance_defaulters"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_fee_installments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fee_plans: {
        Row: {
          admission_fee: number
          admission_payment_breakdown: Json | null
          annual_fee: number
          annual_fee_schedule: Database["public"]["Enums"]["annual_fee_schedule_type"]
          annual_fund: number
          board_admission_fee: number
          created_at: string
          id: string
          installment_count: number
          notes: string | null
          pay_at_admission: number
          policy_id: string | null
          scholarship_discount: number
          scholarship_label: string | null
          semester_fee: number
          start_after_months: number
          student_id: string
          updated_at: string
        }
        Insert: {
          admission_fee?: number
          admission_payment_breakdown?: Json | null
          annual_fee?: number
          annual_fee_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"]
          annual_fund?: number
          board_admission_fee?: number
          created_at?: string
          id?: string
          installment_count?: number
          notes?: string | null
          pay_at_admission?: number
          policy_id?: string | null
          scholarship_discount?: number
          scholarship_label?: string | null
          semester_fee?: number
          start_after_months?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          admission_fee?: number
          admission_payment_breakdown?: Json | null
          annual_fee?: number
          annual_fee_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"]
          annual_fund?: number
          board_admission_fee?: number
          created_at?: string
          id?: string
          installment_count?: number
          notes?: string | null
          pay_at_admission?: number
          policy_id?: string | null
          scholarship_discount?: number
          scholarship_label?: string | null
          semester_fee?: number
          start_after_months?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_plans_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "admission_fee_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "finance_defaulters"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_fee_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_session_id: string | null
          address: string | null
          admission_date: string
          class_id: string | null
          cnic: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          father_name: string | null
          full_name: string
          gender: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          inquiry_id: string | null
          matric_marks_obtained: number | null
          matric_marks_total: number | null
          matric_school: string | null
          phone: string | null
          photo_url: string | null
          preferred_section_id: string | null
          program_id: string | null
          roll_number: string
          section_id: string | null
          session: string | null
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_session_id?: string | null
          address?: string | null
          admission_date?: string
          class_id?: string | null
          cnic?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          father_name?: string | null
          full_name: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          inquiry_id?: string | null
          matric_marks_obtained?: number | null
          matric_marks_total?: number | null
          matric_school?: string | null
          phone?: string | null
          photo_url?: string | null
          preferred_section_id?: string | null
          program_id?: string | null
          roll_number: string
          section_id?: string | null
          session?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_session_id?: string | null
          address?: string | null
          admission_date?: string
          class_id?: string | null
          cnic?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          father_name?: string | null
          full_name?: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          inquiry_id?: string | null
          matric_marks_obtained?: number | null
          matric_marks_total?: number | null
          matric_school?: string | null
          phone?: string | null
          photo_url?: string | null
          preferred_section_id?: string | null
          program_id?: string | null
          roll_number?: string
          section_id?: string | null
          session?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_preferred_section_id_fkey"
            columns: ["preferred_section_id"]
            isOneToOne: false
            referencedRelation: "finance_section_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "students_preferred_section_id_fkey"
            columns: ["preferred_section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "finance_section_summary"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "students_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      finance_defaulters: {
        Row: {
          class_name: string | null
          earliest_due: string | null
          full_name: string | null
          guardian_phone: string | null
          overdue_amount: number | null
          overdue_count: number | null
          phone: string | null
          program_name: string | null
          roll_number: string | null
          section_name: string | null
          student_id: string | null
        }
        Relationships: []
      }
      finance_monthly_collection: {
        Row: {
          month: string | null
          payment_count: number | null
          total_collected: number | null
        }
        Relationships: []
      }
      finance_section_summary: {
        Row: {
          class_name: string | null
          outstanding: number | null
          program_name: string | null
          section_id: string | null
          section_name: string | null
          student_count: number | null
          total_billed: number | null
          total_collected: number | null
        }
        Relationships: []
      }
      finance_upcoming_month: {
        Row: {
          expected_amount: number | null
          installment_count: number | null
          month: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_issue_due_vouchers: {
        Args: { p_days_ahead?: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      next_admission_number: { Args: { p_session_id: string }; Returns: string }
      next_finance_number: { Args: { p_key: string }; Returns: string }
    }
    Enums: {
      annual_fee_schedule_type: "monthly" | "quarterly" | "custom"
      app_role:
        | "super_admin"
        | "admission_officer"
        | "finance_officer"
        | "receptionist"
        | "teacher"
        | "student"
      fee_component_type:
        | "admission_fee"
        | "annual_fund"
        | "annual_fee"
        | "semester_fee"
        | "board_admission_fee"
      inquiry_status: "new" | "follow_up" | "interested" | "converted" | "lost"
      payment_method: "cash" | "bank" | "online" | "other"
      program_type: "intermediate" | "bs"
      section_gender: "boys" | "girls"
      student_status: "active" | "inactive" | "graduated" | "dropped"
      voucher_source: "manual" | "installment"
      voucher_status: "draft" | "issued" | "partial" | "paid" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      annual_fee_schedule_type: ["monthly", "quarterly", "custom"],
      app_role: [
        "super_admin",
        "admission_officer",
        "finance_officer",
        "receptionist",
        "teacher",
        "student",
      ],
      fee_component_type: [
        "admission_fee",
        "annual_fund",
        "annual_fee",
        "semester_fee",
        "board_admission_fee",
      ],
      inquiry_status: ["new", "follow_up", "interested", "converted", "lost"],
      payment_method: ["cash", "bank", "online", "other"],
      program_type: ["intermediate", "bs"],
      section_gender: ["boys", "girls"],
      student_status: ["active", "inactive", "graduated", "dropped"],
      voucher_source: ["manual", "installment"],
      voucher_status: ["draft", "issued", "partial", "paid", "cancelled"],
    },
  },
} as const
