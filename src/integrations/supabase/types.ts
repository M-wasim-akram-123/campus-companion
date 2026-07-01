export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      academic_sessions: {
        Row: {
          created_at: string;
          end_year: number;
          id: string;
          is_active: boolean;
          label: string;
          start_year: number;
        };
        Insert: {
          created_at?: string;
          end_year: number;
          id?: string;
          is_active?: boolean;
          label: string;
          start_year: number;
        };
        Update: {
          created_at?: string;
          end_year?: number;
          id?: string;
          is_active?: boolean;
          label?: string;
          start_year?: number;
        };
        Relationships: [];
      };
      admission_fee_policies: {
        Row: {
          academic_session_id: string | null;
          created_at: string;
          default_admission_components: Database["public"]["Enums"]["fee_component_type"][] | null;
          default_installment_count: number;
          default_schedule: Database["public"]["Enums"]["annual_fee_schedule_type"] | null;
          default_start_after_months: number;
          projection_cycle_type: string;
          projection_cycle_count: number;
          increment_type: string;
          increment_value: number;
          annual_fund_frequency: string;
          id: string;
          is_active: boolean;
          name: string;
          program_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id?: string | null;
          created_at?: string;
          default_admission_components?: Database["public"]["Enums"]["fee_component_type"][] | null;
          default_installment_count?: number;
          default_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"] | null;
          default_start_after_months?: number;
          projection_cycle_type?: string;
          projection_cycle_count?: number;
          increment_type?: string;
          increment_value?: number;
          annual_fund_frequency?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          program_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string | null;
          created_at?: string;
          default_admission_components?: Database["public"]["Enums"]["fee_component_type"][] | null;
          default_installment_count?: number;
          default_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"] | null;
          default_start_after_months?: number;
          projection_cycle_type?: string;
          projection_cycle_count?: number;
          increment_type?: string;
          increment_value?: number;
          annual_fund_frequency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          program_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admission_fee_policies_academic_session_id_fkey";
            columns: ["academic_session_id"];
            isOneToOne: false;
            referencedRelation: "academic_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admission_fee_policies_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      admission_number_counters: {
        Row: {
          academic_session_id: string;
          last_number: number;
        };
        Insert: {
          academic_session_id: string;
          last_number?: number;
        };
        Update: {
          academic_session_id?: string;
          last_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "admission_number_counters_academic_session_id_fkey";
            columns: ["academic_session_id"];
            isOneToOne: true;
            referencedRelation: "academic_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      campus_incharge_assignments: {
        Row: {
          id: string;
          user_id: string;
          class_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          class_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          class_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campus_incharge_assignments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      cashier_sessions: {
        Row: {
          cashier_id: string;
          closed_at: string | null;
          closed_by: string | null;
          counted_cash: number | null;
          created_at: string;
          expected_cash: number;
          id: string;
          notes: string | null;
          opened_at: string;
          opening_cash: number;
          status: Database["public"]["Enums"]["cashier_session_status"];
          updated_at: string;
          variance: number | null;
        };
        Insert: {
          cashier_id: string;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_cash?: number | null;
          created_at?: string;
          expected_cash?: number;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opening_cash?: number;
          status?: Database["public"]["Enums"]["cashier_session_status"];
          updated_at?: string;
          variance?: number | null;
        };
        Update: {
          cashier_id?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          counted_cash?: number | null;
          created_at?: string;
          expected_cash?: number;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opening_cash?: number;
          status?: Database["public"]["Enums"]["cashier_session_status"];
          updated_at?: string;
          variance?: number | null;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          program_id: string;
          year_level: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          program_id: string;
          year_level: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          program_id?: string;
          year_level?: number;
        };
        Relationships: [
          {
            foreignKeyName: "classes_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_payment_allocations: {
        Row: {
          amount: number;
          id: string;
          installment_id: string | null;
          payment_id: string;
        };
        Insert: {
          amount: number;
          id?: string;
          installment_id?: string | null;
          payment_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          installment_id?: string | null;
          payment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_payment_allocations_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "student_fee_installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_payment_allocations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "fee_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_payments: {
        Row: {
          amount: number;
          cashier_session_id: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          paid_at: string;
          payment_method: Database["public"]["Enums"]["payment_method"];
          receipt_number: string;
          recorded_by: string | null;
          reversal_reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          student_id: string;
          voucher_id: string | null;
        };
        Insert: {
          amount: number;
          cashier_session_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          receipt_number: string;
          recorded_by?: string | null;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          student_id: string;
          voucher_id?: string | null;
        };
        Update: {
          amount?: number;
          cashier_session_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          receipt_number?: string;
          recorded_by?: string | null;
          reversal_reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          student_id?: string;
          voucher_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fee_payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "finance_defaulters";
            referencedColumns: ["student_id"];
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_payments_voucher_id_fkey";
            columns: ["voucher_id"];
            isOneToOne: false;
            referencedRelation: "fee_vouchers";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_policy_components: {
        Row: {
          amount: number;
          component_type: Database["public"]["Enums"]["fee_component_type"];
          id: string;
          policy_id: string;
        };
        Insert: {
          amount?: number;
          component_type: Database["public"]["Enums"]["fee_component_type"];
          id?: string;
          policy_id: string;
        };
        Update: {
          amount?: number;
          component_type?: Database["public"]["Enums"]["fee_component_type"];
          id?: string;
          policy_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_policy_components_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "admission_fee_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_policy_installment_templates: {
        Row: {
          amount: number;
          component_type: Database["public"]["Enums"]["fee_component_type"] | null;
          due_day: number | null;
          due_months_after_admission: number;
          id: string;
          label: string;
          policy_id: string;
          sort_order: number;
        };
        Insert: {
          amount?: number;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          due_day?: number | null;
          due_months_after_admission?: number;
          id?: string;
          label: string;
          policy_id: string;
          sort_order?: number;
        };
        Update: {
          amount?: number;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          due_day?: number | null;
          due_months_after_admission?: number;
          id?: string;
          label?: string;
          policy_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fee_policy_installment_templates_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "admission_fee_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_scholarship_slabs: {
        Row: {
          applies_to: Database["public"]["Enums"]["fee_component_type"];
          discount_percent: number;
          id: string;
          label: string | null;
          max_percentage: number | null;
          min_percentage: number;
          policy_id: string;
          sort_order: number;
        };
        Insert: {
          applies_to?: Database["public"]["Enums"]["fee_component_type"];
          discount_percent?: number;
          id?: string;
          label?: string | null;
          max_percentage?: number | null;
          min_percentage: number;
          policy_id: string;
          sort_order?: number;
        };
        Update: {
          applies_to?: Database["public"]["Enums"]["fee_component_type"];
          discount_percent?: number;
          id?: string;
          label?: string | null;
          max_percentage?: number | null;
          min_percentage?: number;
          policy_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fee_scholarship_slabs_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "admission_fee_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_voucher_lines: {
        Row: {
          amount: number;
          id: string;
          installment_id: string | null;
          label: string;
          sort_order: number;
          voucher_id: string;
        };
        Insert: {
          amount: number;
          id?: string;
          installment_id?: string | null;
          label: string;
          sort_order?: number;
          voucher_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          installment_id?: string | null;
          label?: string;
          sort_order?: number;
          voucher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_voucher_lines_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "student_fee_installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_voucher_lines_voucher_id_fkey";
            columns: ["voucher_id"];
            isOneToOne: false;
            referencedRelation: "fee_vouchers";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_vouchers: {
        Row: {
          created_at: string;
          created_by: string | null;
          due_date: string;
          id: string;
          issued_at: string;
          notes: string | null;
          paid_amount: number;
          qr_token: string;
          source: Database["public"]["Enums"]["voucher_source"];
          status: Database["public"]["Enums"]["voucher_status"];
          student_id: string;
          total_amount: number;
          updated_at: string;
          voucher_number: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          due_date: string;
          id?: string;
          issued_at?: string;
          notes?: string | null;
          paid_amount?: number;
          qr_token?: string;
          source?: Database["public"]["Enums"]["voucher_source"];
          status?: Database["public"]["Enums"]["voucher_status"];
          student_id: string;
          total_amount: number;
          updated_at?: string;
          voucher_number: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          due_date?: string;
          id?: string;
          issued_at?: string;
          notes?: string | null;
          paid_amount?: number;
          qr_token?: string;
          source?: Database["public"]["Enums"]["voucher_source"];
          status?: Database["public"]["Enums"]["voucher_status"];
          student_id?: string;
          total_amount?: number;
          updated_at?: string;
          voucher_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_vouchers_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "finance_defaulters";
            referencedColumns: ["student_id"];
          },
          {
            foreignKeyName: "fee_vouchers_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          notes: string | null;
          student_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          notes?: string | null;
          student_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          notes?: string | null;
          student_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finance_audit_log_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_counters: {
        Row: {
          counter_key: string;
          last_number: number;
          year: number;
        };
        Insert: {
          counter_key: string;
          last_number?: number;
          year: number;
        };
        Update: {
          counter_key?: string;
          last_number?: number;
          year?: number;
        };
        Relationships: [];
      };
      board_gazette_imports: {
        Row: {
          board_code: string;
          exam_level: string;
          exam_session: string;
          exam_year: number;
          id: string;
          imported_at: string;
          is_active: boolean;
          label: string;
          marks_total: number;
          row_count: number;
          source_file: string | null;
        };
        Insert: {
          board_code?: string;
          exam_level: string;
          exam_session?: string;
          exam_year: number;
          id?: string;
          imported_at?: string;
          is_active?: boolean;
          label: string;
          marks_total?: number;
          row_count?: number;
          source_file?: string | null;
        };
        Update: {
          board_code?: string;
          exam_level?: string;
          exam_session?: string;
          exam_year?: number;
          id?: string;
          imported_at?: string;
          is_active?: boolean;
          label?: string;
          marks_total?: number;
          row_count?: number;
          source_file?: string | null;
        };
        Relationships: [];
      };
      board_gazette_results: {
        Row: {
          candidate_name: string | null;
          created_at: string;
          id: string;
          import_id: string;
          marks_obtained: number | null;
          result_status: string;
          roll_number: string;
        };
        Insert: {
          candidate_name?: string | null;
          created_at?: string;
          id?: string;
          import_id: string;
          marks_obtained?: number | null;
          result_status?: string;
          roll_number: string;
        };
        Update: {
          candidate_name?: string | null;
          created_at?: string;
          id?: string;
          import_id?: string;
          marks_obtained?: number | null;
          result_status?: string;
          roll_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "board_gazette_results_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "board_gazette_imports";
            referencedColumns: ["id"];
          },
        ];
      };
      inquiries: {
        Row: {
          academic_session_id: string | null;
          assigned_at: string | null;
          assigned_to: string | null;
          board_gazette_import_id: string | null;
          board_roll_number: string | null;
          class_id: string | null;
          converted_at: string | null;
          converted_by: string | null;
          converted_student_id: string | null;
          cnic: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          enrollment_type: Database["public"]["Enums"]["student_enrollment_type"];
          father_name: string | null;
          follow_up_date: string | null;
          follow_up_assigned_at: string | null;
          follow_up_assigned_to: string | null;
          full_name: string;
          gender: string | null;
          guardian_details: string | null;
          guardian_name: string | null;
          guardian_occupation: string | null;
          guardian_phone: string | null;
          id: string;
          matric_marks_obtained: number | null;
          matric_marks_total: number | null;
          matric_school: string | null;
          notes: string | null;
          phone: string;
          photo_url: string | null;
          preferred_section_id: string | null;
          program_id: string | null;
          status: Database["public"]["Enums"]["inquiry_status"];
          updated_at: string;
        };
        Insert: {
          academic_session_id?: string | null;
          assigned_at?: string | null;
          assigned_to?: string | null;
          board_gazette_import_id?: string | null;
          board_roll_number?: string | null;
          class_id?: string | null;
          converted_at?: string | null;
          converted_by?: string | null;
          converted_student_id?: string | null;
          cnic?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          father_name?: string | null;
          follow_up_date?: string | null;
          follow_up_assigned_at?: string | null;
          follow_up_assigned_to?: string | null;
          full_name: string;
          gender?: string | null;
          guardian_details?: string | null;
          guardian_name?: string | null;
          guardian_occupation?: string | null;
          guardian_phone?: string | null;
          id?: string;
          matric_marks_obtained?: number | null;
          matric_marks_total?: number | null;
          matric_school?: string | null;
          notes?: string | null;
          phone: string;
          photo_url?: string | null;
          preferred_section_id?: string | null;
          program_id?: string | null;
          status?: Database["public"]["Enums"]["inquiry_status"];
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string | null;
          assigned_at?: string | null;
          assigned_to?: string | null;
          board_gazette_import_id?: string | null;
          board_roll_number?: string | null;
          class_id?: string | null;
          converted_at?: string | null;
          converted_by?: string | null;
          converted_student_id?: string | null;
          cnic?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          father_name?: string | null;
          follow_up_date?: string | null;
          follow_up_assigned_at?: string | null;
          follow_up_assigned_to?: string | null;
          full_name?: string;
          gender?: string | null;
          guardian_details?: string | null;
          guardian_name?: string | null;
          guardian_occupation?: string | null;
          guardian_phone?: string | null;
          id?: string;
          matric_marks_obtained?: number | null;
          matric_marks_total?: number | null;
          matric_school?: string | null;
          notes?: string | null;
          phone?: string;
          photo_url?: string | null;
          preferred_section_id?: string | null;
          program_id?: string | null;
          status?: Database["public"]["Enums"]["inquiry_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inquiries_preferred_section_id_fkey";
            columns: ["preferred_section_id"];
            isOneToOne: false;
            referencedRelation: "finance_section_summary";
            referencedColumns: ["section_id"];
          },
          {
            foreignKeyName: "inquiries_preferred_section_id_fkey";
            columns: ["preferred_section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiries_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      inquiry_interactions: {
        Row: {
          created_at: string;
          created_by: string | null;
          follow_up_date: string | null;
          id: string;
          inquiry_id: string;
          interaction_type: string;
          remarks: string;
          status_after: Database["public"]["Enums"]["inquiry_status"] | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          follow_up_date?: string | null;
          id?: string;
          inquiry_id: string;
          interaction_type?: string;
          remarks: string;
          status_after?: Database["public"]["Enums"]["inquiry_status"] | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          follow_up_date?: string | null;
          id?: string;
          inquiry_id?: string;
          interaction_type?: string;
          remarks?: string;
          status_after?: Database["public"]["Enums"]["inquiry_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "inquiry_interactions_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active_auth_session_id: string | null;
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          last_login_at: string | null;
          last_seen_at: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          active_auth_session_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          last_login_at?: string | null;
          last_seen_at?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          active_auth_session_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          last_login_at?: string | null;
          last_seen_at?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      programs: {
        Row: {
          created_at: string;
          duration_years: number;
          id: string;
          name: string;
          type: Database["public"]["Enums"]["program_type"];
        };
        Insert: {
          created_at?: string;
          duration_years?: number;
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["program_type"];
        };
        Update: {
          created_at?: string;
          duration_years?: number;
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["program_type"];
        };
        Relationships: [];
      };
      sections: {
        Row: {
          capacity: number | null;
          class_id: string;
          created_at: string;
          gender: Database["public"]["Enums"]["section_gender"];
          id: string;
          merit_max_percentage: number | null;
          merit_min_percentage: number | null;
          name: string;
          session_id: string | null;
        };
        Insert: {
          capacity?: number | null;
          class_id: string;
          created_at?: string;
          gender?: Database["public"]["Enums"]["section_gender"];
          id?: string;
          merit_max_percentage?: number | null;
          merit_min_percentage?: number | null;
          name: string;
          session_id?: string | null;
        };
        Update: {
          capacity?: number | null;
          class_id?: string;
          created_at?: string;
          gender?: Database["public"]["Enums"]["section_gender"];
          id?: string;
          merit_max_percentage?: number | null;
          merit_min_percentage?: number | null;
          name?: string;
          session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sections_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sections_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "academic_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      student_document_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          document_id: string | null;
          id: string;
          notes: string | null;
          student_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          document_id?: string | null;
          id?: string;
          notes?: string | null;
          student_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          document_id?: string | null;
          id?: string;
          notes?: string | null;
          student_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_document_audit_log_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "student_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_document_audit_log_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_documents: {
        Row: {
          created_at: string;
          document_type: Database["public"]["Enums"]["student_document_type"];
          file_path: string;
          file_size: number | null;
          id: string;
          mime_type: string | null;
          original_file_name: string | null;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["student_document_status"];
          student_id: string;
          updated_at: string;
          uploaded_at: string;
          uploaded_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          document_type: Database["public"]["Enums"]["student_document_type"];
          file_path: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          original_file_name?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["student_document_status"];
          student_id: string;
          updated_at?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          document_type?: Database["public"]["Enums"]["student_document_type"];
          file_path?: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          original_file_name?: string | null;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["student_document_status"];
          student_id?: string;
          updated_at?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "student_documents_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_fee_installments: {
        Row: {
          amount: number;
          component_type: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at: string;
          due_date: string;
          fee_plan_id: string;
          id: string;
          label: string;
          paid_amount: number;
          sort_order: number;
          status: string;
          student_id: string;
        };
        Insert: {
          amount: number;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at?: string;
          due_date: string;
          fee_plan_id: string;
          id?: string;
          label: string;
          paid_amount?: number;
          sort_order?: number;
          status?: string;
          student_id: string;
        };
        Update: {
          amount?: number;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at?: string;
          due_date?: string;
          fee_plan_id?: string;
          id?: string;
          label?: string;
          paid_amount?: number;
          sort_order?: number;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_fee_installments_fee_plan_id_fkey";
            columns: ["fee_plan_id"];
            isOneToOne: false;
            referencedRelation: "student_fee_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fee_installments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "finance_defaulters";
            referencedColumns: ["student_id"];
          },
          {
            foreignKeyName: "student_fee_installments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_finance_ledger: {
        Row: {
          approved_by: string | null;
          component_type: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at: string;
          created_by: string | null;
          credit: number;
          debit: number;
          effective_date: string;
          entry_type: Database["public"]["Enums"]["finance_ledger_entry_type"];
          id: string;
          installment_id: string | null;
          label: string;
          metadata: Json;
          notes: string | null;
          payment_id: string | null;
          reversed_entry_id: string | null;
          status: string;
          student_id: string;
          voucher_id: string | null;
        };
        Insert: {
          approved_by?: string | null;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at?: string;
          created_by?: string | null;
          credit?: number;
          debit?: number;
          effective_date?: string;
          entry_type: Database["public"]["Enums"]["finance_ledger_entry_type"];
          id?: string;
          installment_id?: string | null;
          label: string;
          metadata?: Json;
          notes?: string | null;
          payment_id?: string | null;
          reversed_entry_id?: string | null;
          status?: string;
          student_id: string;
          voucher_id?: string | null;
        };
        Update: {
          approved_by?: string | null;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          created_at?: string;
          created_by?: string | null;
          credit?: number;
          debit?: number;
          effective_date?: string;
          entry_type?: Database["public"]["Enums"]["finance_ledger_entry_type"];
          id?: string;
          installment_id?: string | null;
          label?: string;
          metadata?: Json;
          notes?: string | null;
          payment_id?: string | null;
          reversed_entry_id?: string | null;
          status?: string;
          student_id?: string;
          voucher_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_finance_ledger_installment_id_fkey";
            columns: ["installment_id"];
            isOneToOne: false;
            referencedRelation: "student_fee_installments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_finance_ledger_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "fee_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_finance_ledger_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_finance_ledger_voucher_id_fkey";
            columns: ["voucher_id"];
            isOneToOne: false;
            referencedRelation: "fee_vouchers";
            referencedColumns: ["id"];
          },
        ];
      };
      student_fee_projections: {
        Row: {
          id: string;
          student_id: string;
          fee_plan_id: string | null;
          cycle_no: number;
          cycle_label: string;
          component_type: Database["public"]["Enums"]["fee_component_type"] | null;
          policy_amount: number;
          scholarship_discount: number;
          payable_amount: number;
          due_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          fee_plan_id?: string | null;
          cycle_no: number;
          cycle_label: string;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          policy_amount?: number;
          scholarship_discount?: number;
          payable_amount?: number;
          due_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          fee_plan_id?: string | null;
          cycle_no?: number;
          cycle_label?: string;
          component_type?: Database["public"]["Enums"]["fee_component_type"] | null;
          policy_amount?: number;
          scholarship_discount?: number;
          payable_amount?: number;
          due_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_fee_projections_fee_plan_id_fkey";
            columns: ["fee_plan_id"];
            isOneToOne: false;
            referencedRelation: "student_fee_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fee_projections_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_fee_plans: {
        Row: {
          admission_fee: number;
          admission_payment_breakdown: Json | null;
          annual_fee: number;
          annual_fee_schedule: Database["public"]["Enums"]["annual_fee_schedule_type"];
          annual_fund: number;
          board_admission_fee: number;
          board_registration_fee: number;
          board_examination_fee: number;
          classes_fee_total: number | null;
          created_at: string;
          enrollment_type: Database["public"]["Enums"]["student_enrollment_type"];
          fee_clearance_months: number | null;
          id: string;
          installment_count: number;
          notes: string | null;
          pay_at_admission: number;
          policy_id: string | null;
          scholarship_discount: number;
          scholarship_label: string | null;
          semester_fee: number;
          start_after_months: number;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          admission_fee?: number;
          admission_payment_breakdown?: Json | null;
          annual_fee?: number;
          annual_fee_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"];
          annual_fund?: number;
          board_admission_fee?: number;
          board_registration_fee?: number;
          board_examination_fee?: number;
          classes_fee_total?: number | null;
          created_at?: string;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          fee_clearance_months?: number | null;
          id?: string;
          installment_count?: number;
          notes?: string | null;
          pay_at_admission?: number;
          policy_id?: string | null;
          scholarship_discount?: number;
          scholarship_label?: string | null;
          semester_fee?: number;
          start_after_months?: number;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          admission_fee?: number;
          admission_payment_breakdown?: Json | null;
          annual_fee?: number;
          annual_fee_schedule?: Database["public"]["Enums"]["annual_fee_schedule_type"];
          annual_fund?: number;
          board_admission_fee?: number;
          board_registration_fee?: number;
          board_examination_fee?: number;
          classes_fee_total?: number | null;
          created_at?: string;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          fee_clearance_months?: number | null;
          id?: string;
          installment_count?: number;
          notes?: string | null;
          pay_at_admission?: number;
          policy_id?: string | null;
          scholarship_discount?: number;
          scholarship_label?: string | null;
          semester_fee?: number;
          start_after_months?: number;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_fee_plans_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "admission_fee_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_fee_plans_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "finance_defaulters";
            referencedColumns: ["student_id"];
          },
          {
            foreignKeyName: "student_fee_plans_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      roll_no_slip_requests: {
        Row: {
          academic_session_id: string | null;
          approval_notes: string | null;
          approved_amount: number | null;
          approved_at: string | null;
          approved_by: string | null;
          class_id: string | null;
          created_at: string;
          guarantor_name: string;
          guarantor_phone: string | null;
          id: string;
          outstanding_amount_at_request: number;
          promised_payment_date: string | null;
          reason: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_notes: string | null;
          released_at: string | null;
          released_by: string | null;
          requested_by: string | null;
          section_id: string | null;
          settled_at: string | null;
          status: Database["public"]["Enums"]["roll_no_slip_request_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          academic_session_id?: string | null;
          approval_notes?: string | null;
          approved_amount?: number | null;
          approved_at?: string | null;
          approved_by?: string | null;
          class_id?: string | null;
          created_at?: string;
          guarantor_name: string;
          guarantor_phone?: string | null;
          id?: string;
          outstanding_amount_at_request?: number;
          promised_payment_date?: string | null;
          reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_notes?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          requested_by?: string | null;
          section_id?: string | null;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["roll_no_slip_request_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          academic_session_id?: string | null;
          approval_notes?: string | null;
          approved_amount?: number | null;
          approved_at?: string | null;
          approved_by?: string | null;
          class_id?: string | null;
          created_at?: string;
          guarantor_name?: string;
          guarantor_phone?: string | null;
          id?: string;
          outstanding_amount_at_request?: number;
          promised_payment_date?: string | null;
          reason?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_notes?: string | null;
          released_at?: string | null;
          released_by?: string | null;
          requested_by?: string | null;
          section_id?: string | null;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["roll_no_slip_request_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roll_no_slip_requests_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          academic_session_id: string | null;
          address: string | null;
          admission_date: string;
          class_id: string | null;
          cnic: string | null;
          created_at: string;
          date_of_birth: string | null;
          email: string | null;
          enrollment_type: Database["public"]["Enums"]["student_enrollment_type"];
          father_name: string | null;
          full_name: string;
          gender: string | null;
          guardian_name: string | null;
          guardian_occupation: string | null;
          guardian_phone: string | null;
          guardian_details: string | null;
          id: string;
          inquiry_id: string | null;
          matric_marks_obtained: number | null;
          matric_marks_total: number | null;
          matric_school: string | null;
          phone: string | null;
          photo_url: string | null;
          preferred_section_id: string | null;
          program_id: string | null;
          roll_number: string;
          section_id: string | null;
          session: string | null;
          status: Database["public"]["Enums"]["student_status"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          academic_session_id?: string | null;
          address?: string | null;
          admission_date?: string;
          class_id?: string | null;
          cnic?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          father_name?: string | null;
          full_name: string;
          gender?: string | null;
          guardian_name?: string | null;
          guardian_occupation?: string | null;
          guardian_phone?: string | null;
          guardian_details?: string | null;
          id?: string;
          inquiry_id?: string | null;
          matric_marks_obtained?: number | null;
          matric_marks_total?: number | null;
          matric_school?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          preferred_section_id?: string | null;
          program_id?: string | null;
          roll_number: string;
          section_id?: string | null;
          session?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          academic_session_id?: string | null;
          address?: string | null;
          admission_date?: string;
          class_id?: string | null;
          cnic?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          enrollment_type?: Database["public"]["Enums"]["student_enrollment_type"];
          father_name?: string | null;
          full_name?: string;
          gender?: string | null;
          guardian_name?: string | null;
          guardian_occupation?: string | null;
          guardian_phone?: string | null;
          guardian_details?: string | null;
          id?: string;
          inquiry_id?: string | null;
          matric_marks_obtained?: number | null;
          matric_marks_total?: number | null;
          matric_school?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          preferred_section_id?: string | null;
          program_id?: string | null;
          roll_number?: string;
          section_id?: string | null;
          session?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "students_academic_session_id_fkey";
            columns: ["academic_session_id"];
            isOneToOne: false;
            referencedRelation: "academic_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_preferred_section_id_fkey";
            columns: ["preferred_section_id"];
            isOneToOne: false;
            referencedRelation: "finance_section_summary";
            referencedColumns: ["section_id"];
          },
          {
            foreignKeyName: "students_preferred_section_id_fkey";
            columns: ["preferred_section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "finance_section_summary";
            referencedColumns: ["section_id"];
          },
          {
            foreignKeyName: "students_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      finance_defaulters: {
        Row: {
          class_name: string | null;
          earliest_due: string | null;
          full_name: string | null;
          guardian_phone: string | null;
          overdue_amount: number | null;
          overdue_count: number | null;
          phone: string | null;
          program_name: string | null;
          roll_number: string | null;
          section_name: string | null;
          student_id: string | null;
        };
        Relationships: [];
      };
      finance_monthly_collection: {
        Row: {
          month: string | null;
          payment_count: number | null;
          total_collected: number | null;
        };
        Relationships: [];
      };
      finance_section_summary: {
        Row: {
          class_name: string | null;
          outstanding: number | null;
          program_name: string | null;
          section_id: string | null;
          section_name: string | null;
          student_count: number | null;
          total_billed: number | null;
          total_collected: number | null;
        };
        Relationships: [];
      };
      finance_upcoming_month: {
        Row: {
          expected_amount: number | null;
          installment_count: number | null;
          month: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      add_student_finance_charge: {
        Args: {
          p_amount: number;
          p_component_type?: Database["public"]["Enums"]["fee_component_type"];
          p_effective_date?: string;
          p_entry_type: Database["public"]["Enums"]["finance_ledger_entry_type"];
          p_label: string;
          p_notes?: string;
          p_student_id: string;
        };
        Returns: string;
      };
      auto_issue_due_vouchers: {
        Args: { p_days_ahead?: number };
        Returns: number;
      };
      can_upload_student_document: {
        Args: {
          p_document_type: Database["public"]["Enums"]["student_document_type"];
          p_student_id: string;
        };
        Returns: boolean;
      };
      cancel_fee_voucher: {
        Args: { p_reason: string; p_voucher_id: string };
        Returns: string;
      };
      close_cashier_session: {
        Args: {
          p_counted_cash: number;
          p_notes?: string;
          p_session_id: string;
        };
        Returns: string;
      };
      current_student_id: { Args: Record<PropertyKey, never>; Returns: string };
      create_fee_voucher: {
        Args: {
          p_due_date: string;
          p_lines?: Json;
          p_notes?: string;
          p_source?: Database["public"]["Enums"]["voucher_source"];
          p_student_id: string;
        };
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_finance_admin: { Args: { _user_id: string }; Returns: boolean };
      campus_incharge_can_view_student: {
        Args: { _student_id: string; _user_id: string };
        Returns: boolean;
      };
      has_broad_student_access: { Args: { _user_id: string }; Returns: boolean };
      is_finance_staff: { Args: { _user_id: string }; Returns: boolean };
      is_student_owner: { Args: { _student_id: string }; Returns: boolean };
      is_document_staff: { Args: { _user_id: string }; Returns: boolean };
      is_student_document_owner: { Args: { _student_id: string }; Returns: boolean };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      next_admission_number: { Args: { p_session_id: string }; Returns: string };
      next_finance_number: { Args: { p_key: string }; Returns: string };
      record_admission_fee_payment: {
        Args: {
          p_allocations?: Json;
          p_amount: number;
          p_notes?: string;
          p_paid_at?: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_receipt_number: string;
          p_student_id: string;
        };
        Returns: string;
      };
      record_fee_payment: {
        Args: {
          p_allocations?: Json;
          p_amount: number;
          p_cashier_session_id?: string;
          p_notes?: string;
          p_paid_at?: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_receipt_number: string;
          p_student_id: string;
          p_voucher_id?: string;
        };
        Returns: string;
      };
      review_student_document: {
        Args: {
          p_document_id: string;
          p_rejection_reason?: string;
          p_status: Database["public"]["Enums"]["student_document_status"];
        };
        Returns: string;
      };
      student_update_own_profile: {
        Args: {
          p_address?: string;
          p_email?: string;
          p_guardian_details?: string;
          p_guardian_name?: string;
          p_guardian_occupation?: string;
          p_guardian_phone?: string;
          p_phone?: string;
        };
        Returns: string;
      };
      submit_student_document: {
        Args: {
          p_document_type: Database["public"]["Enums"]["student_document_type"];
          p_file_path: string;
          p_file_size?: number;
          p_mime_type?: string;
          p_original_file_name?: string;
        };
        Returns: string;
      };
    };
    Enums: {
      annual_fee_schedule_type: "monthly" | "quarterly" | "custom";
      app_role:
        | "super_admin"
        | "campus_incharge"
        | "registrar"
        | "admission_officer"
        | "sub_admission_officer"
        | "hr"
        | "finance_admin"
        | "finance_officer"
        | "cashier"
        | "receptionist"
        | "teacher"
        | "student";
      cashier_session_status: "open" | "closed" | "cancelled";
      fee_component_type:
        | "admission_fee"
        | "annual_fund"
        | "annual_fee"
        | "semester_fee"
        | "board_admission_fee"
        | "board_registration_fee"
        | "board_examination_fee";
      finance_ledger_entry_type:
        | "fee_charge"
        | "fine"
        | "late_fee"
        | "payment"
        | "waiver"
        | "adjustment"
        | "reversal"
        | "bad_debt";
      inquiry_status:
        | "new"
        | "follow_up"
        | "interested"
        | "ready_for_admission"
        | "converted"
        | "lost";
      payment_method: "cash" | "bank" | "online" | "other";
      program_type: "intermediate" | "bs";
      roll_no_slip_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "released"
        | "settled";
      section_gender: "boys" | "girls";
      student_document_status: "pending_review" | "approved" | "rejected";
      student_document_type:
        | "cnic_b_form"
        | "guardian_cnic"
        | "domicile"
        | "matric_result_card"
        | "other_supporting";
      student_status: "active" | "inactive" | "graduated" | "dropped" | "left" | "bad_debt";
      student_enrollment_type: "regular" | "classes_only";
      voucher_source: "manual" | "installment";
      voucher_status: "draft" | "issued" | "partial" | "paid" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      annual_fee_schedule_type: ["monthly", "quarterly", "custom"],
      app_role: [
        "super_admin",
        "campus_incharge",
        "registrar",
        "admission_officer",
        "sub_admission_officer",
        "hr",
        "finance_admin",
        "finance_officer",
        "cashier",
        "receptionist",
        "teacher",
        "student",
      ],
      cashier_session_status: ["open", "closed", "cancelled"],
      fee_component_type: [
        "admission_fee",
        "annual_fund",
        "annual_fee",
        "semester_fee",
        "board_admission_fee",
        "board_registration_fee",
        "board_examination_fee",
      ],
      finance_ledger_entry_type: [
        "fee_charge",
        "fine",
        "late_fee",
        "payment",
        "waiver",
        "adjustment",
        "reversal",
        "bad_debt",
      ],
      inquiry_status: [
        "new",
        "follow_up",
        "interested",
        "ready_for_admission",
        "converted",
        "lost",
      ],
      payment_method: ["cash", "bank", "online", "other"],
      program_type: ["intermediate", "bs"],
      roll_no_slip_request_status: ["pending", "approved", "rejected", "released", "settled"],
      section_gender: ["boys", "girls"],
      student_document_status: ["pending_review", "approved", "rejected"],
      student_document_type: [
        "cnic_b_form",
        "guardian_cnic",
        "domicile",
        "matric_result_card",
        "other_supporting",
      ],
      student_status: ["active", "inactive", "graduated", "dropped", "left", "bad_debt"],
      student_enrollment_type: ["regular", "classes_only"],
      voucher_source: ["manual", "installment"],
      voucher_status: ["draft", "issued", "partial", "paid", "cancelled"],
    },
  },
} as const;
