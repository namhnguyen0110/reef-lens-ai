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
      cameras: {
        Row: {
          active_window_end: string | null
          active_window_start: string | null
          brand: string
          connection_type: string
          connection_url: string | null
          created_at: string
          id: string
          last_snapshot_at: string | null
          mock_seed: number
          name: string
          snapshot_interval_minutes: number
          status: string
          tank_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_window_end?: string | null
          active_window_start?: string | null
          brand?: string
          connection_type?: string
          connection_url?: string | null
          created_at?: string
          id?: string
          last_snapshot_at?: string | null
          mock_seed?: number
          name: string
          snapshot_interval_minutes?: number
          status?: string
          tank_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_window_end?: string | null
          active_window_start?: string | null
          brand?: string
          connection_type?: string
          connection_url?: string | null
          created_at?: string
          id?: string
          last_snapshot_at?: string | null
          mock_seed?: number
          name?: string
          snapshot_interval_minutes?: number
          status?: string
          tank_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      corals: {
        Row: {
          cover_photo_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          species: string | null
          tank_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          species?: string | null
          tank_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          species?: string | null
          tank_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corals_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          affected_area: string | null
          alternatives: Json | null
          auto_captured: boolean
          camera_id: string | null
          captured_at: string | null
          confidence: number | null
          coral_id: string | null
          created_at: string
          crop_box: Json | null
          diagnosis: string | null
          explanation: string | null
          id: string
          image_url: string
          likely_causes: Json | null
          next_step: string | null
          notes: string | null
          quality_coverage: string | null
          quality_lighting: string | null
          quality_sharpness: string | null
          quality_stability: string | null
          raw_ai: Json | null
          severity: string | null
          source_photo_id: string | null
          status: string
          storage_path: string
          tags: string[] | null
          tank_id: string | null
          treatment_plan: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affected_area?: string | null
          alternatives?: Json | null
          auto_captured?: boolean
          camera_id?: string | null
          captured_at?: string | null
          confidence?: number | null
          coral_id?: string | null
          created_at?: string
          crop_box?: Json | null
          diagnosis?: string | null
          explanation?: string | null
          id?: string
          image_url: string
          likely_causes?: Json | null
          next_step?: string | null
          notes?: string | null
          quality_coverage?: string | null
          quality_lighting?: string | null
          quality_sharpness?: string | null
          quality_stability?: string | null
          raw_ai?: Json | null
          severity?: string | null
          source_photo_id?: string | null
          status?: string
          storage_path: string
          tags?: string[] | null
          tank_id?: string | null
          treatment_plan?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affected_area?: string | null
          alternatives?: Json | null
          auto_captured?: boolean
          camera_id?: string | null
          captured_at?: string | null
          confidence?: number | null
          coral_id?: string | null
          created_at?: string
          crop_box?: Json | null
          diagnosis?: string | null
          explanation?: string | null
          id?: string
          image_url?: string
          likely_causes?: Json | null
          next_step?: string | null
          notes?: string | null
          quality_coverage?: string | null
          quality_lighting?: string | null
          quality_sharpness?: string | null
          quality_stability?: string | null
          raw_ai?: Json | null
          severity?: string | null
          source_photo_id?: string | null
          status?: string
          storage_path?: string
          tags?: string[] | null
          tank_id?: string | null
          treatment_plan?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_coral_id_fkey"
            columns: ["coral_id"]
            isOneToOne: false
            referencedRelation: "corals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_source_photo_id_fkey"
            columns: ["source_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tanks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
