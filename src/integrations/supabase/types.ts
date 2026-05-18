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
            foreignKeyName: "inquiries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
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
          session_id: string
        }
        Insert: {
          capacity?: number | null
          class_id: string
          created_at?: string
          gender: Database["public"]["Enums"]["section_gender"]
          id?: string
          name: string
          session_id: string
        }
        Update: {
          capacity?: number | null
          class_id?: string
          created_at?: string
          gender?: Database["public"]["Enums"]["section_gender"]
          id?: string
          name?: string
          session_id?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      next_admission_number: { Args: { p_session_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admission_officer"
        | "finance_officer"
        | "receptionist"
        | "teacher"
        | "student"
      inquiry_status: "new" | "follow_up" | "interested" | "converted" | "lost"
      program_type: "intermediate" | "bs"
      section_gender: "boys" | "girls"
      student_status: "active" | "inactive" | "graduated" | "dropped"
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
      app_role: [
        "super_admin",
        "admission_officer",
        "finance_officer",
        "receptionist",
        "teacher",
        "student",
      ],
      inquiry_status: ["new", "follow_up", "interested", "converted", "lost"],
      program_type: ["intermediate", "bs"],
      section_gender: ["boys", "girls"],
      student_status: ["active", "inactive", "graduated", "dropped"],
    },
  },
} as const
