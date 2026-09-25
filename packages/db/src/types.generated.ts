export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          exam_weights: Json
          fourth_subject_bonus_threshold_gp: number
          id: string
          is_current: boolean
          name: string
          starts_on: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          exam_weights?: Json
          fourth_subject_bonus_threshold_gp?: number
          id?: string
          is_current?: boolean
          name: string
          starts_on: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          exam_weights?: Json
          fourth_subject_bonus_threshold_gp?: number
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_years_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_action_catalog: {
        Row: {
          action: string
          created_at: string
          domain: string | null
          is_generic: boolean
          sentence_bn: string
          sentence_en: string
          severity: Database["public"]["Enums"]["audit_severity"]
        }
        Insert: {
          action: string
          created_at?: string
          domain?: string | null
          is_generic?: boolean
          sentence_bn: string
          sentence_en: string
          severity: Database["public"]["Enums"]["audit_severity"]
        }
        Update: {
          action?: string
          created_at?: string
          domain?: string | null
          is_generic?: boolean
          sentence_bn?: string
          sentence_en?: string
          severity?: Database["public"]["Enums"]["audit_severity"]
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["audit_actor_kind"]
          after: Json | null
          before: Json | null
          changed_fields: string[] | null
          correlation_id: string | null
          created_at: string
          id: number
          ip: unknown
          request_ip_hash: string | null
          row_id: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
          subject_user_id: string | null
          table_name: string
          user_agent: string | null
          user_agent_family: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["audit_actor_kind"]
          after?: Json | null
          before?: Json | null
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          id?: never
          ip?: unknown
          request_ip_hash?: string | null
          row_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          subject_user_id?: string | null
          table_name: string
          user_agent?: string | null
          user_agent_family?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["audit_actor_kind"]
          after?: Json | null
          before?: Json | null
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string
          id?: never
          ip?: unknown
          request_ip_hash?: string | null
          row_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          subject_user_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_agent_family?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      auth_throttle: {
        Row: {
          attempts: number
          blocked_until: string | null
          key: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          key: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          key?: string
          window_started_at?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          channel: string
          consenting_user_id: string | null
          created_at: string
          evidence_file_id: string | null
          guardian_id: string | null
          id: number
          invitation_id: string | null
          ip_hash: string | null
          locale: string
          masked_address: string | null
          purpose: string
          subject_id: string | null
          subject_type: string
          text_sha256: string
          text_version: string
          workspace_id: string | null
        }
        Insert: {
          channel: string
          consenting_user_id?: string | null
          created_at?: string
          evidence_file_id?: string | null
          guardian_id?: string | null
          id?: never
          invitation_id?: string | null
          ip_hash?: string | null
          locale?: string
          masked_address?: string | null
          purpose: string
          subject_id?: string | null
          subject_type: string
          text_sha256: string
          text_version: string
          workspace_id?: string | null
        }
        Update: {
          channel?: string
          consenting_user_id?: string | null
          created_at?: string
          evidence_file_id?: string | null
          guardian_id?: string | null
          id?: never
          invitation_id?: string | null
          ip_hash?: string | null
          locale?: string
          masked_address?: string | null
          purpose?: string
          subject_id?: string | null
          subject_type?: string
          text_sha256?: string
          text_version?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      custom_labels: {
        Row: {
          base_role: Database["public"]["Enums"]["member_role"]
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_role: Database["public"]["Enums"]["member_role"]
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_role?: Database["public"]["Enums"]["member_role"]
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_labels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          detail: string | null
          due_on: string
          file_id: string | null
          id: string
          kind: string
          legal_hold_reason: string | null
          refusal_reason: string | null
          requester_user_id: string
          status: string
          subject_id: string | null
          subject_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string
          file_id?: string | null
          id?: string
          kind: string
          legal_hold_reason?: string | null
          refusal_reason?: string | null
          requester_user_id: string
          status?: string
          subject_id?: string | null
          subject_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string
          file_id?: string | null
          id?: string
          kind?: string
          legal_hold_reason?: string | null
          refusal_reason?: string | null
          requester_user_id?: string
          status?: string
          subject_id?: string | null
          subject_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      device_registrations: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          last_seen_at: string
          os_version: string | null
          platform: Database["public"]["Enums"]["device_platform"]
          push_token: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          os_version?: string | null
          platform: Database["public"]["Enums"]["device_platform"]
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          last_seen_at?: string
          os_version?: string | null
          platform?: Database["public"]["Enums"]["device_platform"]
          push_token?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          correlation_id: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          from_email: string
          id: number
          provider: string
          provider_message_id: string | null
          related_row_id: string | null
          related_table: string | null
          reply_to: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          template: string
          to_email: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          from_email: string
          id?: never
          provider?: string
          provider_message_id?: string | null
          related_row_id?: string | null
          related_table?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          template: string
          to_email: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          from_email?: string
          id?: never
          provider?: string
          provider_message_id?: string | null
          related_row_id?: string | null
          related_table?: string | null
          reply_to?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          template?: string
          to_email?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      file_access_log: {
        Row: {
          action: Database["public"]["Enums"]["file_access_action"]
          correlation_id: string | null
          created_at: string
          file_id: string
          id: number
          ip: unknown
          user_agent: string | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["file_access_action"]
          correlation_id?: string | null
          created_at?: string
          file_id: string
          id?: never
          ip?: unknown
          user_agent?: string | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["file_access_action"]
          correlation_id?: string | null
          created_at?: string
          file_id?: string
          id?: never
          ip?: unknown
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          bucket: string
          checksum_sha256: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          download_count: number
          id: string
          is_sensitive: boolean
          kind: string | null
          linked_row_id: string | null
          linked_table: string | null
          mime_type: string
          original_name: string
          owner_id: string | null
          path: string
          purge_after: string | null
          size_bytes: number
          updated_at: string
          virus_scan_status: string
          visibility: Database["public"]["Enums"]["file_visibility"]
          workspace_id: string
        }
        Insert: {
          bucket?: string
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          download_count?: number
          id?: string
          is_sensitive?: boolean
          kind?: string | null
          linked_row_id?: string | null
          linked_table?: string | null
          mime_type: string
          original_name: string
          owner_id?: string | null
          path: string
          purge_after?: string | null
          size_bytes: number
          updated_at?: string
          virus_scan_status?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
          workspace_id: string
        }
        Update: {
          bucket?: string
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          download_count?: number
          id?: string
          is_sensitive?: boolean
          kind?: string | null
          linked_row_id?: string | null
          linked_table?: string | null
          mime_type?: string
          original_name?: string
          owner_id?: string | null
          path?: string
          purge_after?: string | null
          size_bytes?: number
          updated_at?: string
          virus_scan_status?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          level_number: number
          name: string
          name_bn: string
          stage: Database["public"]["Enums"]["grade_stage"] | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          level_number: number
          name: string
          name_bn: string
          stage?: Database["public"]["Enums"]["grade_stage"] | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          level_number?: number
          name?: string
          name_bn?: string
          stage?: Database["public"]["Enums"]["grade_stage"] | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_levels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_levels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          id: string
          kind: Database["public"]["Enums"]["holiday_kind"]
          name: string
          name_bn: string | null
          note: string | null
          source: Database["public"]["Enums"]["holiday_source"]
          starts_on: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          id?: string
          kind?: Database["public"]["Enums"]["holiday_kind"]
          name: string
          name_bn?: string | null
          note?: string | null
          source?: Database["public"]["Enums"]["holiday_source"]
          starts_on: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["holiday_kind"]
          name?: string
          name_bn?: string | null
          note?: string | null
          source?: Database["public"]["Enums"]["holiday_source"]
          starts_on?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document: string
          id: number
          ip_hash: string | null
          locale: string
          text_sha256: string
          user_agent: string | null
          user_id: string
          version: string
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string
          document: string
          id?: never
          ip_hash?: string | null
          locale?: string
          text_sha256: string
          user_agent?: string | null
          user_id: string
          version: string
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string
          document?: string
          id?: never
          ip_hash?: string | null
          locale?: string
          text_sha256?: string
          user_agent?: string | null
          user_id?: string
          version?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string
          actor_id: string | null
          archived_at: string | null
          body: string | null
          category: string | null
          created_at: string
          data: Json
          event_type: string
          expires_at: string | null
          id: number
          priority: number
          read_at: string | null
          recipient_id: string
          title: string
          workspace_id: string | null
        }
        Insert: {
          action_url: string
          actor_id?: string | null
          archived_at?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          data?: Json
          event_type: string
          expires_at?: string | null
          id?: never
          priority?: number
          read_at?: string | null
          recipient_id: string
          title: string
          workspace_id?: string | null
        }
        Update: {
          action_url?: string
          actor_id?: string | null
          archived_at?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          data?: Json
          event_type?: string
          expires_at?: string | null
          id?: never
          priority?: number
          read_at?: string | null
          recipient_id?: string
          title?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          draft: Json | null
          path: Database["public"]["Enums"]["onboarding_path"]
          started_at: string
          step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          draft?: Json | null
          path?: Database["public"]["Enums"]["onboarding_path"]
          started_at?: string
          step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          draft?: Json | null
          path?: Database["public"]["Enums"]["onboarding_path"]
          started_at?: string
          step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_data_map: {
        Row: {
          category: string
          column_name: string
          erasure_method: string
          legal_basis: string | null
          retention_note: string | null
          table_name: string
          updated_at: string
        }
        Insert: {
          category: string
          column_name: string
          erasure_method: string
          legal_basis?: string | null
          retention_note?: string | null
          table_name: string
          updated_at?: string
        }
        Update: {
          category?: string
          column_name?: string
          erasure_method?: string
          legal_basis?: string | null
          retention_note?: string | null
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          key: string
          plan_id: string
          value_int: number | null
        }
        Insert: {
          key: string
          plan_id: string
          value_int?: number | null
        }
        Update: {
          key?: string
          plan_id?: string
          value_int?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_modules: {
        Row: {
          is_enabled: boolean
          module: string
          plan_id: string
        }
        Insert: {
          is_enabled?: boolean
          module: string
          plan_id: string
        }
        Update: {
          is_enabled?: boolean
          module?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          created_at: string
          currency: string
          id: string
          monthly_paisa: number
          overage_per_student_paisa: number
          plan_id: string
          student_max: number | null
          student_min: number
          updated_at: string
          yearly_paisa: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          monthly_paisa: number
          overage_per_student_paisa?: number
          plan_id: string
          student_max?: number | null
          student_min?: number
          updated_at?: string
          yearly_paisa: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          monthly_paisa?: number
          overage_per_student_paisa?: number
          plan_id?: string
          student_max?: number | null
          student_min?: number
          updated_at?: string
          yearly_paisa?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          included_sms_per_month: number
          is_contact_sales: boolean
          is_public: boolean
          name: string
          setup_fee_paisa: number
          sort_order: number
          status: string
          tagline: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_sms_per_month?: number
          is_contact_sales?: boolean
          is_public?: boolean
          name: string
          setup_fee_paisa?: number
          sort_order?: number
          status?: string
          tagline?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          included_sms_per_month?: number
          is_contact_sales?: boolean
          is_public?: boolean
          name?: string
          setup_fee_paisa?: number
          sort_order?: number
          status?: string
          tagline?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          ai_topup_actions: number
          ai_topup_monthly_ceiling_multiplier: number
          ai_topup_price_paisa: number
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_topup_actions?: number
          ai_topup_monthly_ceiling_multiplier?: number
          ai_topup_price_paisa?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_topup_actions?: number
          ai_topup_monthly_ceiling_multiplier?: number
          ai_topup_price_paisa?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          full_name: string
          id: string
          is_platform_admin: boolean
          last_active_workspace_id: string | null
          last_seen_at: string | null
          locale: string
          onboarding_completed_at: string | null
          phone: string | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_platform_admin?: boolean
          last_active_workspace_id?: string | null
          last_seen_at?: string | null
          locale?: string
          onboarding_completed_at?: string | null
          phone?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_platform_admin?: boolean
          last_active_workspace_id?: string | null
          last_seen_at?: string | null
          locale?: string
          onboarding_completed_at?: string | null
          phone?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_active_workspace_id_fkey"
            columns: ["last_active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      school_profiles: {
        Row: {
          academic_settings: Json
          address_line1: string | null
          address_line2: string | null
          ai_billing_model: Database["public"]["Enums"]["ai_billing_model"]
          attendance_policy: Json
          bin_number: string | null
          board: string
          branding: Json
          city: string
          contact_email: string | null
          contact_phone: string | null
          country: string
          cover_policy: Json
          created_at: string
          currency: string
          date_format: string
          district: string | null
          eiin: string | null
          legal_name: string | null
          medium: string
          messaging_policy: Json
          motto: string | null
          postal_code: string | null
          school_type: string | null
          timezone: string
          updated_at: string
          vat_number: string | null
          website: string | null
          working_days: number[]
          workspace_id: string
        }
        Insert: {
          academic_settings?: Json
          address_line1?: string | null
          address_line2?: string | null
          ai_billing_model?: Database["public"]["Enums"]["ai_billing_model"]
          attendance_policy?: Json
          bin_number?: string | null
          board?: string
          branding?: Json
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          cover_policy?: Json
          created_at?: string
          currency?: string
          date_format?: string
          district?: string | null
          eiin?: string | null
          legal_name?: string | null
          medium?: string
          messaging_policy?: Json
          motto?: string | null
          postal_code?: string | null
          school_type?: string | null
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          working_days?: number[]
          workspace_id: string
        }
        Update: {
          academic_settings?: Json
          address_line1?: string | null
          address_line2?: string | null
          ai_billing_model?: Database["public"]["Enums"]["ai_billing_model"]
          attendance_policy?: Json
          bin_number?: string | null
          board?: string
          branding?: Json
          city?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          cover_policy?: Json
          created_at?: string
          currency?: string
          date_format?: string
          district?: string | null
          eiin?: string | null
          legal_name?: string | null
          medium?: string
          messaging_policy?: Json
          motto?: string | null
          postal_code?: string | null
          school_type?: string | null
          timezone?: string
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          working_days?: number[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_compensation: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          hourly_rate_paisa: number | null
          id: string
          monthly_salary_paisa: number | null
          note: string | null
          staff_record_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from: string
          effective_to?: string | null
          hourly_rate_paisa?: number | null
          id?: string
          monthly_salary_paisa?: number | null
          note?: string | null
          staff_record_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          hourly_rate_paisa?: number | null
          id?: string
          monthly_salary_paisa?: number | null
          note?: string | null
          staff_record_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_compensation_staff_record_fk"
            columns: ["workspace_id", "staff_record_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "staff_compensation_staff_record_fk"
            columns: ["workspace_id", "staff_record_id"]
            isOneToOne: false
            referencedRelation: "staff_records"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "staff_compensation_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          created_at: string
          expires_on: string | null
          file_id: string
          id: string
          issued_on: string | null
          kind: Database["public"]["Enums"]["staff_document_kind"]
          label: string | null
          staff_record_id: string
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          file_id: string
          id?: string
          issued_on?: string | null
          kind: Database["public"]["Enums"]["staff_document_kind"]
          label?: string | null
          staff_record_id: string
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          file_id?: string
          id?: string
          issued_on?: string | null
          kind?: Database["public"]["Enums"]["staff_document_kind"]
          label?: string | null
          staff_record_id?: string
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_record_fk"
            columns: ["workspace_id", "staff_record_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "staff_documents_staff_record_fk"
            columns: ["workspace_id", "staff_record_id"]
            isOneToOne: false
            referencedRelation: "staff_records"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "staff_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_records: {
        Row: {
          address: string | null
          application_id: string | null
          blood_group: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          department: string | null
          designation_label_id: string | null
          emergency_contact: Json
          employment_history: Json
          employment_status: Database["public"]["Enums"]["staff_status"]
          employment_type: Database["public"]["Enums"]["staff_employment_type"]
          full_name: string
          gender: string | null
          id: string
          joined_on: string | null
          left_on: string | null
          membership_id: string | null
          nid_number: string | null
          notes: string | null
          personal_phone: string | null
          qualifications: Json
          staff_code: string
          subject_ids: string[]
          updated_at: string
          user_id: string | null
          work_email: string | null
          work_phone: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          application_id?: string | null
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          designation_label_id?: string | null
          emergency_contact?: Json
          employment_history?: Json
          employment_status?: Database["public"]["Enums"]["staff_status"]
          employment_type?: Database["public"]["Enums"]["staff_employment_type"]
          full_name: string
          gender?: string | null
          id?: string
          joined_on?: string | null
          left_on?: string | null
          membership_id?: string | null
          nid_number?: string | null
          notes?: string | null
          personal_phone?: string | null
          qualifications?: Json
          staff_code: string
          subject_ids?: string[]
          updated_at?: string
          user_id?: string | null
          work_email?: string | null
          work_phone?: string | null
          workspace_id: string
        }
        Update: {
          address?: string | null
          application_id?: string | null
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          designation_label_id?: string | null
          emergency_contact?: Json
          employment_history?: Json
          employment_status?: Database["public"]["Enums"]["staff_status"]
          employment_type?: Database["public"]["Enums"]["staff_employment_type"]
          full_name?: string
          gender?: string | null
          id?: string
          joined_on?: string | null
          left_on?: string | null
          membership_id?: string | null
          nid_number?: string | null
          notes?: string | null
          personal_phone?: string | null
          qualifications?: Json
          staff_code?: string
          subject_ids?: string[]
          updated_at?: string
          user_id?: string | null
          work_email?: string | null
          work_phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_designation_label_id_fkey"
            columns: ["designation_label_id"]
            isOneToOne: false
            referencedRelation: "custom_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          actor_id: string | null
          amount_paisa: number | null
          created_at: string
          data: Json
          from_status: Database["public"]["Enums"]["subscription_status"] | null
          id: number
          inbound_event_id: number | null
          subscription_id: string
          to_status: Database["public"]["Enums"]["subscription_status"] | null
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          amount_paisa?: number | null
          created_at?: string
          data?: Json
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: never
          inbound_event_id?: number | null
          subscription_id: string
          to_status?: Database["public"]["Enums"]["subscription_status"] | null
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          amount_paisa?: number | null
          created_at?: string
          data?: Json
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: never
          inbound_event_id?: number | null
          subscription_id?: string
          to_status?: Database["public"]["Enums"]["subscription_status"] | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_paisa: number
          auto_renew: boolean
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          grace_until: string | null
          id: string
          plan_id: string
          plan_price_id: string | null
          provider: string
          provider_customer_ref: string | null
          provider_subscription_ref: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          student_band_snapshot: unknown
          student_count_snapshot: number | null
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_paisa?: number
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_until?: string | null
          id?: string
          plan_id: string
          plan_price_id?: string | null
          provider?: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          student_band_snapshot?: unknown
          student_count_snapshot?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_paisa?: number
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_until?: string | null
          id?: string
          plan_id?: string
          plan_price_id?: string | null
          provider?: string
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          student_band_snapshot?: unknown
          student_count_snapshot?: number | null
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          key: string
          limit_hit_at: string | null
          period: string
          updated_at: string
          value: number
          workspace_id: string
        }
        Insert: {
          key: string
          limit_hit_at?: string | null
          period?: string
          updated_at?: string
          value?: number
          workspace_id: string
        }
        Update: {
          key?: string
          limit_hit_at?: string | null
          period?: string
          updated_at?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          channels: Json
          created_at: string
          density: string
          email_digest: string
          language: string
          palette: string
          push_enabled: boolean
          theme_mode: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          created_at?: string
          density?: string
          email_digest?: string
          language?: string
          palette?: string
          push_enabled?: boolean
          theme_mode?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          created_at?: string
          density?: string
          email_digest?: string
          language?: string
          palette?: string
          push_enabled?: boolean
          theme_mode?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      working_day_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_working: boolean
          reason: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_working: boolean
          reason: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_working?: boolean
          reason?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_day_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_day_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          channel: Database["public"]["Enums"]["invitation_channel"]
          created_at: string
          declined_at: string | null
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          label_id: string | null
          last_sent_at: string | null
          message: string | null
          phone: string | null
          resent_count: number
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          token_prefix: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          declined_at?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          label_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          phone?: string | null
          resent_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          token_prefix: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          channel?: Database["public"]["Enums"]["invitation_channel"]
          created_at?: string
          declined_at?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          label_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          phone?: string | null
          resent_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "custom_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_capabilities: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          note: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_capabilities_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_capabilities_member_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "workspace_member_capabilities_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          employee_code: string | null
          id: string
          invitation_id: string | null
          invited_by: string | null
          joined_at: string | null
          label_id: string | null
          phone: string | null
          removed_at: string | null
          removed_by: string | null
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          subjects: string[]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          employee_code?: string | null
          id?: string
          invitation_id?: string | null
          invited_by?: string | null
          joined_at?: string | null
          label_id?: string | null
          phone?: string | null
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          subjects?: string[]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          employee_code?: string | null
          id?: string
          invitation_id?: string | null
          invited_by?: string | null
          joined_at?: string | null
          label_id?: string | null
          phone?: string | null
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          subjects?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "workspace_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "custom_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          access_mode: Database["public"]["Enums"]["access_mode"]
          access_mode_reason: string | null
          access_mode_set_at: string | null
          created_at: string
          created_by: string | null
          hidden_modules: string[]
          id: string
          invite_code: string | null
          invite_code_rotated_at: string | null
          logo_url: string | null
          name: string
          owner_id: string
          plan_id: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          trial_ends_at: string | null
          type: Database["public"]["Enums"]["workspace_type"]
          updated_at: string
        }
        Insert: {
          access_mode?: Database["public"]["Enums"]["access_mode"]
          access_mode_reason?: string | null
          access_mode_set_at?: string | null
          created_at?: string
          created_by?: string | null
          hidden_modules?: string[]
          id?: string
          invite_code?: string | null
          invite_code_rotated_at?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          plan_id?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          trial_ends_at?: string | null
          type: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Update: {
          access_mode?: Database["public"]["Enums"]["access_mode"]
          access_mode_reason?: string | null
          access_mode_set_at?: string | null
          created_at?: string
          created_by?: string | null
          hidden_modules?: string[]
          id?: string
          invite_code?: string | null
          invite_code_rotated_at?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          plan_id?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          trial_ends_at?: string | null
          type?: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_events_view: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["audit_actor_kind"] | null
          after: Json | null
          before: Json | null
          changed_fields: string[] | null
          correlation_id: string | null
          created_at: string | null
          id: number | null
          request_ip_hash: string | null
          row_id: string | null
          severity: Database["public"]["Enums"]["audit_severity"] | null
          subject_user_id: string | null
          table_name: string | null
          user_agent_family: string | null
          workspace_id: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["audit_actor_kind"] | null
          after?: Json | null
          before?: Json | null
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string | null
          id?: number | null
          request_ip_hash?: string | null
          row_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"] | null
          subject_user_id?: string | null
          table_name?: string | null
          user_agent_family?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["audit_actor_kind"] | null
          after?: Json | null
          before?: Json | null
          changed_fields?: string[] | null
          correlation_id?: string | null
          created_at?: string | null
          id?: number | null
          request_ip_hash?: string | null
          row_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"] | null
          subject_user_id?: string | null
          table_name?: string | null
          user_agent_family?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      staff_directory: {
        Row: {
          avatar_url: string | null
          base_role: Database["public"]["Enums"]["member_role"] | null
          department: string | null
          designation_label: string | null
          designation_label_id: string | null
          employment_status: Database["public"]["Enums"]["staff_status"] | null
          full_name: string | null
          id: string | null
          joined_on: string | null
          staff_code: string | null
          subject_ids: string[] | null
          user_id: string | null
          work_email: string | null
          work_phone: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_records_designation_label_id_fkey"
            columns: ["designation_label_id"]
            isOneToOne: false
            referencedRelation: "custom_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_eiin_available: { Args: { eiin: string }; Returns: boolean }
      create_school_workspace: { Args: { p_input: Json }; Returns: Json }
      expire_pro_trials: { Args: never; Returns: number }
      list_my_workspaces: {
        Args: never
        Returns: {
          logo_url: string
          name: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          type: Database["public"]["Enums"]["workspace_type"]
          workspace_id: string
        }[]
      }
      log_auth_event: {
        Args: { p_action: string; p_after?: Json }
        Returns: number
      }
      log_auth_event_service: {
        Args: {
          p_action: string
          p_after?: Json
          p_ip?: unknown
          p_row_id: string
          p_user_agent?: string
        }
        Returns: number
      }
      log_tenancy_context_rejected: {
        Args: { p_attempted_workspace_id: string }
        Returns: undefined
      }
      pre_request: { Args: never; Returns: undefined }
      switch_workspace: {
        Args: { p_workspace_id: string }
        Returns: {
          plan_id: string
          role: Database["public"]["Enums"]["member_role"]
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }[]
      }
      throttle_record_failure: {
        Args: { p_bucket: string; p_key: string }
        Returns: {
          blocked: boolean
          retry_after_seconds: number
        }[]
      }
      throttle_reset: { Args: { p_key: string }; Returns: undefined }
      throttle_status: {
        Args: { p_key: string }
        Returns: {
          blocked: boolean
          retry_after_seconds: number
        }[]
      }
    }
    Enums: {
      access_mode: "normal" | "read_only"
      ai_billing_model: "shared_pool" | "individual_allocation"
      audit_actor_kind: "user" | "platform_staff" | "system" | "webhook"
      audit_severity: "info" | "notable" | "critical"
      billing_interval: "monthly" | "yearly"
      device_platform: "web" | "android" | "windows" | "ios"
      email_status:
        | "queued"
        | "sent"
        | "delivered"
        | "bounced"
        | "complained"
        | "failed"
      file_access_action:
        | "upload"
        | "signed_url"
        | "download"
        | "preview"
        | "delete"
      file_visibility: "private" | "workspace" | "public"
      holiday_kind:
        | "public"
        | "religious"
        | "national"
        | "school"
        | "vacation"
        | "weather"
        | "emergency"
      holiday_source: "seed" | "manual" | "import"
      grade_stage: "early" | "primary" | "secondary" | "higher"
      invitation_channel: "email" | "phone"
      invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "revoked"
      member_role: "owner" | "admin" | "teacher" | "staff" | "parent"
      member_status: "pending" | "active" | "removed"
      onboarding_path: "undecided" | "create_school" | "join_school"
      staff_document_kind:
        | "nid"
        | "passport"
        | "degree"
        | "certificate"
        | "contract"
        | "appointment_letter"
        | "police_clearance"
        | "photo"
        | "other"
      staff_employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "substitute"
        | "volunteer"
      staff_status: "pending_join" | "active" | "on_notice" | "left"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
      workspace_status: "active" | "suspended" | "archived"
      workspace_type: "school" | "personal"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      access_mode: ["normal", "read_only"],
      ai_billing_model: ["shared_pool", "individual_allocation"],
      audit_actor_kind: ["user", "platform_staff", "system", "webhook"],
      audit_severity: ["info", "notable", "critical"],
      billing_interval: ["monthly", "yearly"],
      device_platform: ["web", "android", "windows", "ios"],
      email_status: [
        "queued",
        "sent",
        "delivered",
        "bounced",
        "complained",
        "failed",
      ],
      file_access_action: [
        "upload",
        "signed_url",
        "download",
        "preview",
        "delete",
      ],
      file_visibility: ["private", "workspace", "public"],
      holiday_kind: [
        "public",
        "religious",
        "national",
        "school",
        "vacation",
        "weather",
        "emergency",
      ],
      holiday_source: ["seed", "manual", "import"],
      grade_stage: ["early", "primary", "secondary", "higher"],
      invitation_channel: ["email", "phone"],
      invitation_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "revoked",
      ],
      member_role: ["owner", "admin", "teacher", "staff", "parent"],
      member_status: ["pending", "active", "removed"],
      onboarding_path: ["undecided", "create_school", "join_school"],
      staff_document_kind: [
        "nid",
        "passport",
        "degree",
        "certificate",
        "contract",
        "appointment_letter",
        "police_clearance",
        "photo",
        "other",
      ],
      staff_employment_type: [
        "full_time",
        "part_time",
        "contract",
        "substitute",
        "volunteer",
      ],
      staff_status: ["pending_join", "active", "on_notice", "left"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
      workspace_status: ["active", "suspended", "archived"],
      workspace_type: ["school", "personal"],
    },
  },
} as const

