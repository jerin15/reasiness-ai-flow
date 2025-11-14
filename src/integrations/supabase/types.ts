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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_walkie_calls: {
        Row: {
          callee_id: string
          caller_id: string
          id: string
          started_at: string | null
        }
        Insert: {
          callee_id: string
          caller_id: string
          id?: string
          started_at?: string | null
        }
        Update: {
          callee_id?: string
          caller_id?: string
          id?: string
          started_at?: string | null
        }
        Relationships: []
      }
      ai_task_suggestions: {
        Row: {
          created_at: string | null
          feedback: string | null
          id: string
          parsed_data: Json
          raw_input: string
          user_id: string
          was_accepted: boolean | null
        }
        Insert: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          parsed_data: Json
          raw_input: string
          user_id: string
          was_accepted?: boolean | null
        }
        Update: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          parsed_data?: Json
          raw_input?: string
          user_id?: string
          was_accepted?: boolean | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          enabled: boolean | null
          id: string
          notify_roles: Database["public"]["Enums"]["app_role"][] | null
          rule_name: string
          source_status: Database["public"]["Enums"]["task_status"]
          target_status: Database["public"]["Enums"]["task_status"] | null
          threshold_hours: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          id?: string
          notify_roles?: Database["public"]["Enums"]["app_role"][] | null
          rule_name: string
          source_status: Database["public"]["Enums"]["task_status"]
          target_status?: Database["public"]["Enums"]["task_status"] | null
          threshold_hours: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean | null
          id?: string
          notify_roles?: Database["public"]["Enums"]["app_role"][] | null
          rule_name?: string
          source_status?: Database["public"]["Enums"]["task_status"]
          target_status?: Database["public"]["Enums"]["task_status"] | null
          threshold_hours?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      call_sessions: {
        Row: {
          answer: string | null
          answered_at: string | null
          call_type: string
          callee_id: string
          caller_id: string
          created_at: string
          ended_at: string | null
          id: string
          offer: string | null
          status: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          call_type: string
          callee_id: string
          caller_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          offer?: string | null
          status?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          call_type?: string
          callee_id?: string
          caller_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          offer?: string | null
          status?: string
        }
        Relationships: []
      }
      chat_groups: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_pipelines: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          pipeline_name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          pipeline_name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          pipeline_name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          can_create_tasks: boolean
          can_delete_tasks: boolean
          can_edit_all_tasks: boolean
          can_view_all_tasks: boolean
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          role_name: string
          updated_at: string
        }
        Insert: {
          can_create_tasks?: boolean
          can_delete_tasks?: boolean
          can_edit_all_tasks?: boolean
          can_view_all_tasks?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          role_name: string
          updated_at?: string
        }
        Update: {
          can_create_tasks?: boolean
          can_delete_tasks?: boolean
          can_edit_all_tasks?: boolean
          can_view_all_tasks?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      estimation_check_ins: {
        Row: {
          action_taken: string
          check_in_time: string | null
          created_at: string | null
          id: string
          notes: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          action_taken: string
          check_in_time?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          action_taken?: string
          check_in_time?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimation_check_ins_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      estimation_stage_limits: {
        Row: {
          created_at: string | null
          id: string
          stage_status: string
          time_limit_hours: number
          updated_at: string | null
          warning_threshold_hours: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          stage_status: string
          time_limit_hours: number
          updated_at?: string | null
          warning_threshold_hours: number
        }
        Update: {
          created_at?: string | null
          id?: string
          stage_status?: string
          time_limit_hours?: number
          updated_at?: string | null
          warning_threshold_hours?: number
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_candidates: {
        Row: {
          call_session_id: string
          candidate: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          call_session_id: string
          candidate: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          call_session_id?: string
          candidate?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ice_candidates_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string | null
          group_id: string | null
          id: string
          is_read: boolean | null
          message: string
          message_type: string | null
          recipient_id: string
          reply_to_message_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          message_type?: string | null
          recipient_id: string
          reply_to_message_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          message_type?: string | null
          recipient_id?: string
          reply_to_message_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          do_not_disturb_end: string | null
          do_not_disturb_start: string | null
          email_notifications: boolean | null
          id: string
          notification_sound: string | null
          reminder_frequency: string | null
          show_on_leaderboard: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          do_not_disturb_end?: string | null
          do_not_disturb_start?: string | null
          email_notifications?: boolean | null
          id?: string
          notification_sound?: string | null
          reminder_frequency?: string | null
          show_on_leaderboard?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          do_not_disturb_end?: string | null
          do_not_disturb_start?: string | null
          email_notifications?: boolean | null
          id?: string
          notification_sound?: string | null
          reminder_frequency?: string | null
          show_on_leaderboard?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      role_pipeline_access: {
        Row: {
          can_edit: boolean
          can_move_to: boolean
          can_view: boolean
          created_at: string
          id: string
          pipeline_status: string
          role_name: string
        }
        Insert: {
          can_edit?: boolean
          can_move_to?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          pipeline_status: string
          role_name: string
        }
        Update: {
          can_edit?: boolean
          can_move_to?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          pipeline_status?: string
          role_name?: string
        }
        Relationships: []
      }
      supplier_quotes: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          price_aed: number
          quantity: number
          supplier_name: string
          task_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_aed: number
          quantity: number
          supplier_name: string
          task_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          price_aed?: number
          quantity?: number
          supplier_name?: string
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_log: {
        Row: {
          action: string
          browser_name: string | null
          changed_by: string
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          os_name: string | null
          role: string
          task_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          browser_name?: string | null
          changed_by: string
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          os_name?: string | null
          role: string
          task_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          browser_name?: string | null
          changed_by?: string
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          os_name?: string | null
          role?: string
          task_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          id: string
          new_status: Database["public"]["Enums"]["task_status"] | null
          old_status: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["task_status"] | null
          old_status?: Database["public"]["Enums"]["task_status"] | null
          task_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["task_status"] | null
          old_status?: Database["public"]["Enums"]["task_status"] | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_products: {
        Row: {
          approval_notes: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string | null
          designer_completed: boolean | null
          estimated_price: number | null
          final_price: number | null
          id: string
          position: number
          product_name: string
          quantity: number | null
          task_id: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          designer_completed?: boolean | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          position?: number
          product_name: string
          quantity?: number | null
          task_id: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          designer_completed?: boolean | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          position?: number
          product_name?: string
          quantity?: number | null
          task_id?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_products_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reminders: {
        Row: {
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          is_snoozed: boolean | null
          reminder_time: string
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_snoozed?: boolean | null
          reminder_time: string
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_snoozed?: boolean | null
          reminder_time?: string
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_suggestions: {
        Row: {
          accepted: boolean | null
          confidence: number | null
          created_at: string | null
          dismissed: boolean | null
          id: string
          responded_at: string | null
          suggested_status: Database["public"]["Enums"]["task_status"] | null
          suggestion_text: string
          task_id: string
        }
        Insert: {
          accepted?: boolean | null
          confidence?: number | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          responded_at?: string | null
          suggested_status?: Database["public"]["Enums"]["task_status"] | null
          suggestion_text: string
          task_id: string
        }
        Update: {
          accepted?: boolean | null
          confidence?: number | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          responded_at?: string | null
          suggested_status?: Database["public"]["Enums"]["task_status"] | null
          suggestion_text?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_suggestions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          admin_remarks: string | null
          admin_removed_from_production: boolean | null
          ai_confidence_score: number | null
          ai_generated: boolean | null
          assigned_by: string | null
          assigned_to: string | null
          came_from_designer_done: boolean | null
          client_name: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_personal_admin_task: boolean | null
          last_activity_at: string | null
          linked_task_id: string | null
          mockup_completed_by_designer: boolean | null
          my_status: Database["public"]["Enums"]["my_task_status"] | null
          original_input: string | null
          position: number
          previous_status: Database["public"]["Enums"]["task_status"] | null
          priority: Database["public"]["Enums"]["task_priority"]
          reminder_sent: boolean | null
          sent_back_to_designer: boolean | null
          sent_to_designer_mockup: boolean | null
          status: Database["public"]["Enums"]["task_status"]
          status_changed_at: string | null
          supplier_name: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"] | null
          updated_at: string | null
          visible_to: string | null
        }
        Insert: {
          admin_remarks?: string | null
          admin_removed_from_production?: boolean | null
          ai_confidence_score?: number | null
          ai_generated?: boolean | null
          assigned_by?: string | null
          assigned_to?: string | null
          came_from_designer_done?: boolean | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_personal_admin_task?: boolean | null
          last_activity_at?: string | null
          linked_task_id?: string | null
          mockup_completed_by_designer?: boolean | null
          my_status?: Database["public"]["Enums"]["my_task_status"] | null
          original_input?: string | null
          position?: number
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          priority?: Database["public"]["Enums"]["task_priority"]
          reminder_sent?: boolean | null
          sent_back_to_designer?: boolean | null
          sent_to_designer_mockup?: boolean | null
          status?: Database["public"]["Enums"]["task_status"]
          status_changed_at?: string | null
          supplier_name?: string | null
          title: string
          type?: Database["public"]["Enums"]["task_type"] | null
          updated_at?: string | null
          visible_to?: string | null
        }
        Update: {
          admin_remarks?: string | null
          admin_removed_from_production?: boolean | null
          ai_confidence_score?: number | null
          ai_generated?: boolean | null
          assigned_by?: string | null
          assigned_to?: string | null
          came_from_designer_done?: boolean | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_personal_admin_task?: boolean | null
          last_activity_at?: string | null
          linked_task_id?: string | null
          mockup_completed_by_designer?: boolean | null
          my_status?: Database["public"]["Enums"]["my_task_status"] | null
          original_input?: string | null
          position?: number
          previous_status?: Database["public"]["Enums"]["task_status"] | null
          priority?: Database["public"]["Enums"]["task_priority"]
          reminder_sent?: boolean | null
          sent_back_to_designer?: boolean | null
          sent_to_designer_mockup?: boolean | null
          status?: Database["public"]["Enums"]["task_status"]
          status_changed_at?: string | null
          supplier_name?: string | null
          title?: string
          type?: Database["public"]["Enums"]["task_type"] | null
          updated_at?: string | null
          visible_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      urgent_notifications: {
        Row: {
          acknowledged_at: string | null
          created_at: string | null
          id: string
          is_acknowledged: boolean | null
          is_broadcast: boolean | null
          message: string
          priority: string | null
          recipient_id: string | null
          sender_id: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_broadcast?: boolean | null
          message: string
          priority?: string | null
          recipient_id?: string | null
          sender_id: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_broadcast?: boolean | null
          message?: string
          priority?: string | null
          recipient_id?: string | null
          sender_id?: string
          title?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_type: string
          earned_at: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          achievement_type: string
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          achievement_type?: string
          earned_at?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_activity_streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          efficiency_score: number | null
          id: string
          last_activity_date: string | null
          longest_streak: number | null
          total_quick_responses: number | null
          total_tasks_completed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          efficiency_score?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_quick_responses?: number | null
          total_tasks_completed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          efficiency_score?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_quick_responses?: number | null
          total_tasks_completed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_daily_reviews: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          id: string
          review_date: string
          tasks_reviewed: number | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          review_date: string
          tasks_reviewed?: number | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          review_date?: string
          tasks_reviewed?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          custom_message: string | null
          id: string
          last_active: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          custom_message?: string | null
          id?: string
          last_active?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          custom_message?: string | null
          id?: string
          last_active?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_announcements: {
        Row: {
          audio_url: string
          created_at: string | null
          duration: number
          id: string
          is_broadcast: boolean | null
          is_played: boolean | null
          message_text: string | null
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          audio_url: string
          created_at?: string | null
          duration: number
          id?: string
          is_broadcast?: boolean | null
          is_played?: boolean | null
          message_text?: string | null
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          audio_url?: string
          created_at?: string | null
          duration?: number
          id?: string
          is_broadcast?: boolean | null
          is_played?: boolean | null
          message_text?: string | null
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      walkie_talkie_signals: {
        Row: {
          callee_id: string
          caller_id: string
          created_at: string | null
          id: string
          is_processed: boolean | null
          signal_data: Json
          signal_type: string
        }
        Insert: {
          callee_id: string
          caller_id: string
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          signal_data: Json
          signal_type: string
        }
        Update: {
          callee_id?: string
          caller_id?: string
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          signal_data?: Json
          signal_type?: string
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          achievements_earned: string[] | null
          created_at: string | null
          efficiency_score: number | null
          id: string
          longest_stuck_task_id: string | null
          metrics: Json | null
          tasks_completed: number | null
          tasks_pending: number | null
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          achievements_earned?: string[] | null
          created_at?: string | null
          efficiency_score?: number | null
          id?: string
          longest_stuck_task_id?: string | null
          metrics?: Json | null
          tasks_completed?: number | null
          tasks_pending?: number | null
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          achievements_earned?: string[] | null
          created_at?: string | null
          efficiency_score?: number | null
          id?: string
          longest_stuck_task_id?: string | null
          metrics?: Json | null
          tasks_completed?: number | null
          tasks_pending?: number | null
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_due_date_reminders: { Args: never; Returns: undefined }
      cleanup_old_completed_tasks: { Args: never; Returns: undefined }
      get_least_busy_estimation_member: {
        Args: never
        Returns: {
          active_task_count: number
          full_name: string
          user_id: string
        }[]
      }
      get_stuck_quotation_tasks: {
        Args: never
        Returns: {
          assigned_to: string
          assigned_user_name: string
          hours_idle: number
          id: string
          status: string
          time_limit: number
          title: string
        }[]
      }
      get_task_age_hours: { Args: { task_id: string }; Returns: number }
      get_task_hours_idle: { Args: { task_id: string }; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_stuck_quotation_tasks: { Args: { user_id: string }; Returns: boolean }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      mark_old_completed_tasks: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "estimation"
        | "designer"
        | "operations"
        | "technical_head"
        | "client_service"
      my_task_status: "pending" | "done_from_my_side"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "todo"
        | "supplier_quotes"
        | "admin_approval"
        | "quotation_bill"
        | "production"
        | "final_invoice"
        | "mockup_pending"
        | "production_pending"
        | "with_client"
        | "approval"
        | "delivery"
        | "done"
        | "client_approval"
        | "admin_cost_approval"
        | "approved"
        | "rejected"
        | "developing"
        | "testing"
        | "under_review"
        | "deployed"
        | "trial_and_error"
        | "mockup"
        | "production_file"
        | "new_calls"
        | "follow_up"
        | "quotation"
      task_type: "quotation" | "invoice" | "general" | "production" | "design"
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
        "admin",
        "estimation",
        "designer",
        "operations",
        "technical_head",
        "client_service",
      ],
      my_task_status: ["pending", "done_from_my_side"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "todo",
        "supplier_quotes",
        "admin_approval",
        "quotation_bill",
        "production",
        "final_invoice",
        "mockup_pending",
        "production_pending",
        "with_client",
        "approval",
        "delivery",
        "done",
        "client_approval",
        "admin_cost_approval",
        "approved",
        "rejected",
        "developing",
        "testing",
        "under_review",
        "deployed",
        "trial_and_error",
        "mockup",
        "production_file",
        "new_calls",
        "follow_up",
        "quotation",
      ],
      task_type: ["quotation", "invoice", "general", "production", "design"],
    },
  },
} as const
