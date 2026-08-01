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
      activities: {
        Row: {
          completed: boolean | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          subject: string
          type: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          subject: string
          type: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          subject?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      agency_clients: {
        Row: {
          agency_earnings_cents: number
          agency_id: string
          client_user_id: string | null
          created_at: string
          id: string
          invite_email: string | null
          invite_token: string
          joined_at: string | null
          monthly_value_cents: number
          plan: string | null
          status: string
          total_earnings_cents: number
          updated_at: string
        }
        Insert: {
          agency_earnings_cents?: number
          agency_id: string
          client_user_id?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_token?: string
          joined_at?: string | null
          monthly_value_cents?: number
          plan?: string | null
          status?: string
          total_earnings_cents?: number
          updated_at?: string
        }
        Update: {
          agency_earnings_cents?: number
          agency_id?: string
          client_user_id?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_token?: string
          joined_at?: string | null
          monthly_value_cents?: number
          plan?: string | null
          status?: string
          total_earnings_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          action_type: string
          classification: string | null
          created_at: string | null
          description: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          prospect_email: string | null
          reply_content: string | null
          sent_email_id: string | null
          status: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          classification?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          prospect_email?: string | null
          reply_content?: string | null
          sent_email_id?: string | null
          status?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          classification?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          prospect_email?: string | null
          reply_content?: string | null
          sent_email_id?: string | null
          status?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_sent_email_id_fkey"
            columns: ["sent_email_id"]
            isOneToOne: false
            referencedRelation: "sent_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_approvals: {
        Row: {
          body: string | null
          classification: string | null
          company_name: string | null
          created_at: string
          id: string
          integration_row_id: string | null
          kind: string
          lead_id: string | null
          metadata: Json | null
          prospect_email: string | null
          prospect_name: string | null
          reasoning: string | null
          review_note: string | null
          reviewed_at: string | null
          sent_email_id: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          classification?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          integration_row_id?: string | null
          kind: string
          lead_id?: string | null
          metadata?: Json | null
          prospect_email?: string | null
          prospect_name?: string | null
          reasoning?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          sent_email_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          classification?: string | null
          company_name?: string | null
          created_at?: string
          id?: string
          integration_row_id?: string | null
          kind?: string
          lead_id?: string | null
          metadata?: Json | null
          prospect_email?: string | null
          prospect_name?: string | null
          reasoning?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          sent_email_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_events: Json
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_events?: Json
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_events?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_threads: {
        Row: {
          autonomy: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          autonomy?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          autonomy?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_configs: {
        Row: {
          agent_name: string | null
          approval_mode: boolean
          calendly_url: string | null
          can_book_meetings: boolean | null
          can_find_leads: boolean
          can_handle_objections: boolean | null
          can_reply_interested: boolean | null
          can_send_outreach: boolean
          company_context: string | null
          created_at: string | null
          daily_lead_target: number
          enabled: boolean | null
          icp_profile_id: string | null
          icp_snapshot: Json | null
          id: string
          max_daily_auto_replies: number | null
          max_daily_new_emails: number
          objection_responses: Json | null
          persona: string | null
          prospecting_company_size: string | null
          prospecting_country: string | null
          prospecting_industry: string | null
          prospecting_job_title: string | null
          reply_delay_minutes: number | null
          signature: string | null
          tone: string | null
          updated_at: string | null
          user_id: string
          value_props: Json | null
        }
        Insert: {
          agent_name?: string | null
          approval_mode?: boolean
          calendly_url?: string | null
          can_book_meetings?: boolean | null
          can_find_leads?: boolean
          can_handle_objections?: boolean | null
          can_reply_interested?: boolean | null
          can_send_outreach?: boolean
          company_context?: string | null
          created_at?: string | null
          daily_lead_target?: number
          enabled?: boolean | null
          icp_profile_id?: string | null
          icp_snapshot?: Json | null
          id?: string
          max_daily_auto_replies?: number | null
          max_daily_new_emails?: number
          objection_responses?: Json | null
          persona?: string | null
          prospecting_company_size?: string | null
          prospecting_country?: string | null
          prospecting_industry?: string | null
          prospecting_job_title?: string | null
          reply_delay_minutes?: number | null
          signature?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id: string
          value_props?: Json | null
        }
        Update: {
          agent_name?: string | null
          approval_mode?: boolean
          calendly_url?: string | null
          can_book_meetings?: boolean | null
          can_find_leads?: boolean
          can_handle_objections?: boolean | null
          can_reply_interested?: boolean | null
          can_send_outreach?: boolean
          company_context?: string | null
          created_at?: string | null
          daily_lead_target?: number
          enabled?: boolean | null
          icp_profile_id?: string | null
          icp_snapshot?: Json | null
          id?: string
          max_daily_auto_replies?: number | null
          max_daily_new_emails?: number
          objection_responses?: Json | null
          persona?: string | null
          prospecting_company_size?: string | null
          prospecting_country?: string | null
          prospecting_industry?: string | null
          prospecting_job_title?: string | null
          reply_delay_minutes?: number | null
          signature?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id?: string
          value_props?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_icp_profile_id_fkey"
            columns: ["icp_profile_id"]
            isOneToOne: false
            referencedRelation: "icp_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          comparison_operator: string
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          metric_type: string
          name: string
          notification_channels: string[]
          notification_webhook_url: string | null
          threshold_value: number
          time_window_minutes: number
          trigger_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comparison_operator: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric_type: string
          name: string
          notification_channels?: string[]
          notification_webhook_url?: string | null
          threshold_value: number
          time_window_minutes?: number
          trigger_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comparison_operator?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric_type?: string
          name?: string
          notification_channels?: string[]
          notification_webhook_url?: string | null
          threshold_value?: number
          time_window_minutes?: number
          trigger_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_cache: {
        Row: {
          cache_key: string
          cache_value: Json
          created_at: string
          expires_at: string
          id: string
          ttl_seconds: number
        }
        Insert: {
          cache_key: string
          cache_value: Json
          created_at?: string
          expires_at: string
          id?: string
          ttl_seconds?: number
        }
        Update: {
          cache_key?: string
          cache_value?: Json
          created_at?: string
          expires_at?: string
          id?: string
          ttl_seconds?: number
        }
        Relationships: []
      }
      api_key_rotations: {
        Row: {
          id: string
          new_key_id: string
          old_key_id: string
          rotated_at: string
          rotated_by: string
          rotation_reason: string | null
        }
        Insert: {
          id?: string
          new_key_id: string
          old_key_id: string
          rotated_at?: string
          rotated_by: string
          rotation_reason?: string | null
        }
        Update: {
          id?: string
          new_key_id?: string
          old_key_id?: string
          rotated_at?: string
          rotated_by?: string
          rotation_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_rotations_new_key_id_fkey"
            columns: ["new_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          cache_ttl_seconds: number | null
          created_at: string
          enable_caching: boolean
          endpoint_rate_limits: Json | null
          expires_at: string | null
          id: string
          is_active: boolean
          key: string
          last_request_at: string | null
          last_used_at: string | null
          name: string
          prefix: string
          rate_limit_per_day: number
          rate_limit_per_minute: number
          rotation_policy_days: number | null
          rotation_reminder_sent: boolean
          total_requests: number
          user_id: string
        }
        Insert: {
          cache_ttl_seconds?: number | null
          created_at?: string
          enable_caching?: boolean
          endpoint_rate_limits?: Json | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key: string
          last_request_at?: string | null
          last_used_at?: string | null
          name: string
          prefix: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          rotation_policy_days?: number | null
          rotation_reminder_sent?: boolean
          total_requests?: number
          user_id: string
        }
        Update: {
          cache_ttl_seconds?: number | null
          created_at?: string
          enable_caching?: boolean
          endpoint_rate_limits?: Json | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key?: string
          last_request_at?: string | null
          last_used_at?: string | null
          name?: string
          prefix?: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          rotation_policy_days?: number | null
          rotation_reminder_sent?: boolean
          total_requests?: number
          user_id?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          method: string
          response_time_ms: number | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_versions: {
        Row: {
          changelog: string | null
          created_at: string
          deprecation_date: string | null
          id: string
          status: string
          sunset_date: string | null
          updated_at: string
          user_id: string
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          deprecation_date?: string | null
          id?: string
          status?: string
          sunset_date?: string | null
          updated_at?: string
          user_id: string
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          deprecation_date?: string | null
          id?: string
          status?: string
          sunset_date?: string | null
          updated_at?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blacklist_checks: {
        Row: {
          checked_at: string
          detail: string | null
          id: string
          listed: boolean
          rbl_name: string
          target: string
          target_type: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          detail?: string | null
          id?: string
          listed?: boolean
          rbl_name: string
          target: string
          target_type?: string
          user_id: string
        }
        Update: {
          checked_at?: string
          detail?: string | null
          id?: string
          listed?: boolean
          rbl_name?: string
          target?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          expires_at: string | null
          id: string
          ip_address: string
          is_active: boolean
          reason: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          is_active?: boolean
          reason?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          description: string
          id: string
          keywords: string[]
          published_at: string
          reading_time: string
          slug: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          description: string
          id?: string
          keywords?: string[]
          published_at?: string
          reading_time?: string
          slug: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          description?: string
          id?: string
          keywords?: string[]
          published_at?: string
          reading_time?: string
          slug?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_topic_queue: {
        Row: {
          category: string
          created_at: string
          id: string
          keywords: string[]
          priority: number
          target_keyword: string
          topic_brief: string
          used_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          keywords?: string[]
          priority?: number
          target_keyword: string
          topic_brief: string
          used_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          keywords?: string[]
          priority?: number
          target_keyword?: string
          topic_brief?: string
          used_at?: string | null
        }
        Relationships: []
      }
      bounce_events: {
        Row: {
          bounce_type: string
          created_at: string
          detected_at: string
          id: string
          reason: string | null
          sending_account_id: string | null
          sent_email_id: string | null
          smtp_code: string | null
          to_email: string
          user_id: string
        }
        Insert: {
          bounce_type?: string
          created_at?: string
          detected_at?: string
          id?: string
          reason?: string | null
          sending_account_id?: string | null
          sent_email_id?: string | null
          smtp_code?: string | null
          to_email: string
          user_id: string
        }
        Update: {
          bounce_type?: string
          created_at?: string
          detected_at?: string
          id?: string
          reason?: string | null
          sending_account_id?: string | null
          sent_email_id?: string | null
          smtp_code?: string | null
          to_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bounce_events_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounce_events_sent_email_id_fkey"
            columns: ["sent_email_id"]
            isOneToOne: false
            referencedRelation: "sent_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_logs: {
        Row: {
          action: string
          activity_id: string | null
          attempt: number
          created_at: string
          details: Json | null
          direction: string
          error_code: string | null
          error_message: string | null
          google_event_id: string | null
          http_status: number | null
          id: string
          integration_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          activity_id?: string | null
          attempt?: number
          created_at?: string
          details?: Json | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          google_event_id?: string | null
          http_status?: number | null
          id?: string
          integration_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          action?: string
          activity_id?: string | null
          attempt?: number
          created_at?: string
          details?: Json | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          google_event_id?: string | null
          http_status?: number | null
          id?: string
          integration_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_briefs: {
        Row: {
          created_at: string
          forbidden_claims: string[]
          id: string
          name: string
          offer: string | null
          pain_by_persona: Json
          proof: Json
          replaces: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          forbidden_claims?: string[]
          id?: string
          name: string
          offer?: string | null
          pain_by_persona?: Json
          proof?: Json
          replaces?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          forbidden_claims?: string[]
          id?: string
          name?: string
          offer?: string | null
          pain_by_persona?: Json
          proof?: Json
          replaces?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_setup_requests: {
        Row: {
          booked_at: string | null
          created_at: string
          id: string
          notes: string | null
          plan: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booked_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booked_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coaching_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coaching_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coaching_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          domain: string | null
          employee_count: number | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          revenue_range: string | null
          tech_stack: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          revenue_range?: string | null
          tech_stack?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          revenue_range?: string | null
          tech_stack?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          lead_status: string
          linkedin_url: string | null
          seniority: string | null
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lead_status?: string
          linkedin_url?: string | null
          seniority?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lead_status?: string
          linkedin_url?: string | null
          seniority?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_provider_events: {
        Row: {
          cost_units: number
          created_at: string
          id: string
          provider_name: string
          query_hash: string
          results_count: number
          user_id: string
        }
        Insert: {
          cost_units?: number
          created_at?: string
          id?: string
          provider_name?: string
          query_hash: string
          results_count?: number
          user_id: string
        }
        Update: {
          cost_units?: number
          created_at?: string
          id?: string
          provider_name?: string
          query_hash?: string
          results_count?: number
          user_id?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          expected_close_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          probability: number | null
          stage: string
          title: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          probability?: number | null
          stage?: string
          title: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          probability?: number | null
          stage?: string
          title?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverability_alerts: {
        Row: {
          alert_type: string
          created_at: string
          domain: string | null
          id: string
          message: string
          resolved_at: string | null
          sending_account_id: string | null
          severity: string
          status: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          domain?: string | null
          id?: string
          message: string
          resolved_at?: string | null
          sending_account_id?: string | null
          severity?: string
          status?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          domain?: string | null
          id?: string
          message?: string
          resolved_at?: string | null
          sending_account_id?: string | null
          severity?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverability_alerts_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverability_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          opener_word: string | null
          subject: string | null
          tone: string | null
          trigger_context: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          opener_word?: string | null
          subject?: string | null
          tone?: string | null
          trigger_context?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          opener_word?: string | null
          subject?: string | null
          tone?: string | null
          trigger_context?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_sequences: {
        Row: {
          ab_test_enabled: boolean | null
          ab_test_split: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          total_completed: number | null
          total_enrollments: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ab_test_enabled?: boolean | null
          ab_test_split?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          total_completed?: number | null
          total_enrollments?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ab_test_enabled?: boolean | null
          ab_test_split?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          total_completed?: number | null
          total_enrollments?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          subject: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          subject: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrichment_history: {
        Row: {
          enriched_at: string
          error_message: string | null
          fields_enriched: string[]
          id: string
          lead_id: string
          source: string
          status: string
          user_id: string
        }
        Insert: {
          enriched_at?: string
          error_message?: string | null
          fields_enriched?: string[]
          id?: string
          lead_id: string
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          enriched_at?: string
          error_message?: string | null
          fields_enriched?: string[]
          id?: string
          lead_id?: string
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          rollout_percentage: number | null
          target_plans: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          rollout_percentage?: number | null
          target_plans?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          rollout_percentage?: number | null
          target_plans?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      icp_profiles: {
        Row: {
          budget_authority: string[] | null
          business_model: string[] | null
          buying_signals: Json | null
          company_age_range: string[] | null
          company_size_max: number | null
          company_size_min: number | null
          competitor_tools: Json | null
          created_at: string
          customer_examples: string | null
          deal_size_range: string[] | null
          departments: Json | null
          disqualifiers: string | null
          event_triggers: Json | null
          exclude_company_sizes: Json | null
          exclude_domains: Json | null
          exclude_geographies: Json | null
          exclude_industries: Json | null
          exclude_keywords: Json | null
          exclude_tech_stack: Json | null
          exclude_titles: Json | null
          funding_stages: Json | null
          geographies: Json | null
          growth_stage: string[] | null
          hiring_signals: Json | null
          id: string
          industries: Json | null
          intent_keywords: Json | null
          name: string
          notes: string | null
          objections: Json | null
          pain_points: Json | null
          preferred_channels: Json | null
          revenue_range: string[] | null
          sales_cycle: string[] | null
          scoring_weights: Json | null
          seniority_levels: Json | null
          success_metrics: Json | null
          target_titles: Json | null
          tech_stack: Json | null
          updated_at: string
          use_cases: Json | null
          user_id: string
          value_proposition: string | null
        }
        Insert: {
          budget_authority?: string[] | null
          business_model?: string[] | null
          buying_signals?: Json | null
          company_age_range?: string[] | null
          company_size_max?: number | null
          company_size_min?: number | null
          competitor_tools?: Json | null
          created_at?: string
          customer_examples?: string | null
          deal_size_range?: string[] | null
          departments?: Json | null
          disqualifiers?: string | null
          event_triggers?: Json | null
          exclude_company_sizes?: Json | null
          exclude_domains?: Json | null
          exclude_geographies?: Json | null
          exclude_industries?: Json | null
          exclude_keywords?: Json | null
          exclude_tech_stack?: Json | null
          exclude_titles?: Json | null
          funding_stages?: Json | null
          geographies?: Json | null
          growth_stage?: string[] | null
          hiring_signals?: Json | null
          id?: string
          industries?: Json | null
          intent_keywords?: Json | null
          name: string
          notes?: string | null
          objections?: Json | null
          pain_points?: Json | null
          preferred_channels?: Json | null
          revenue_range?: string[] | null
          sales_cycle?: string[] | null
          scoring_weights?: Json | null
          seniority_levels?: Json | null
          success_metrics?: Json | null
          target_titles?: Json | null
          tech_stack?: Json | null
          updated_at?: string
          use_cases?: Json | null
          user_id: string
          value_proposition?: string | null
        }
        Update: {
          budget_authority?: string[] | null
          business_model?: string[] | null
          buying_signals?: Json | null
          company_age_range?: string[] | null
          company_size_max?: number | null
          company_size_min?: number | null
          competitor_tools?: Json | null
          created_at?: string
          customer_examples?: string | null
          deal_size_range?: string[] | null
          departments?: Json | null
          disqualifiers?: string | null
          event_triggers?: Json | null
          exclude_company_sizes?: Json | null
          exclude_domains?: Json | null
          exclude_geographies?: Json | null
          exclude_industries?: Json | null
          exclude_keywords?: Json | null
          exclude_tech_stack?: Json | null
          exclude_titles?: Json | null
          funding_stages?: Json | null
          geographies?: Json | null
          growth_stage?: string[] | null
          hiring_signals?: Json | null
          id?: string
          industries?: Json | null
          intent_keywords?: Json | null
          name?: string
          notes?: string | null
          objections?: Json | null
          pain_points?: Json | null
          preferred_channels?: Json | null
          revenue_range?: string[] | null
          sales_cycle?: string[] | null
          scoring_weights?: Json | null
          seniority_levels?: Json | null
          success_metrics?: Json | null
          target_titles?: Json | null
          tech_stack?: Json | null
          updated_at?: string
          use_cases?: Json | null
          user_id?: string
          value_proposition?: string | null
        }
        Relationships: []
      }
      icp_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          icp_profile_id: string
          id: string
          snapshot: Json
          user_id: string
          version: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          icp_profile_id: string
          id?: string
          snapshot: Json
          user_id: string
          version: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          icp_profile_id?: string
          id?: string
          snapshot?: Json
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "icp_versions_icp_profile_id_fkey"
            columns: ["icp_profile_id"]
            isOneToOne: false
            referencedRelation: "icp_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          failed_count: number
          field_mappings: Json | null
          id: string
          import_type: string
          imported_at: string
          leads_count: number
          search_query: string | null
          source: string
          success_count: number
          user_id: string
        }
        Insert: {
          failed_count?: number
          field_mappings?: Json | null
          id?: string
          import_type?: string
          imported_at?: string
          leads_count?: number
          search_query?: string | null
          source: string
          success_count?: number
          user_id: string
        }
        Update: {
          failed_count?: number
          field_mappings?: Json | null
          id?: string
          import_type?: string
          imported_at?: string
          leads_count?: number
          search_query?: string | null
          source?: string
          success_count?: number
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          connected_email: string | null
          created_at: string
          id: string
          integration_id: string
          integration_name: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          connected_email?: string | null
          created_at?: string
          id?: string
          integration_id: string
          integration_name: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          connected_email?: string | null
          created_at?: string
          id?: string
          integration_id?: string
          integration_name?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_index: {
        Row: {
          canonical_domain: string | null
          canonical_industry: string | null
          canonical_title: string | null
          city: string | null
          company_id: string | null
          contact_id: string | null
          country: string | null
          created_at: string
          data_quality_score: number | null
          employee_bucket: string | null
          id: string
          is_active: boolean
          last_refreshed_at: string | null
          last_verified_at: string | null
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_domain?: string | null
          canonical_industry?: string | null
          canonical_title?: string | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          data_quality_score?: number | null
          employee_bucket?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          last_verified_at?: string | null
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_domain?: string | null
          canonical_industry?: string | null
          canonical_title?: string | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          data_quality_score?: number | null
          employee_bucket?: string | null
          id?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          last_verified_at?: string | null
          region?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_index_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_index_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          contact_id: string
          created_at: string
          enrichment_score: number | null
          explanation: string | null
          icp_score: number | null
          id: string
          intent_score: number | null
          overall_score: number | null
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          enrichment_score?: number | null
          explanation?: string | null
          icp_score?: number | null
          id?: string
          intent_score?: number | null
          overall_score?: number | null
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          enrichment_score?: number | null
          explanation?: string | null
          icp_score?: number | null
          id?: string
          intent_score?: number | null
          overall_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_search_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          annual_revenue: string | null
          company_description: string | null
          company_linkedin: string | null
          company_name: string
          company_size: string | null
          company_website: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          department: string | null
          employee_count: string | null
          engagement_state: string | null
          enriched_at: string | null
          enrichment_status: string | null
          fit_score: number | null
          icp_score: number | null
          id: string
          industry: string | null
          intent_label: string | null
          intent_reasons: string[] | null
          intent_score: number | null
          job_title: string | null
          last_contacted_at: string | null
          lead_status: string
          linkedin_url: string | null
          notes: string | null
          recommended_angle: string | null
          research_brief: Json | null
          research_confidence: string | null
          research_sources: string[] | null
          researched_at: string | null
          score_breakdown: Json | null
          score_changed_at: string | null
          score_reason: string | null
          scored_at: string | null
          seniority: string | null
          signal_date: string | null
          signal_layers: Json | null
          signal_score: number | null
          signal_type: string | null
          signals: string[] | null
          source: string | null
          technologies: string[] | null
          tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_revenue?: string | null
          company_description?: string | null
          company_linkedin?: string | null
          company_name: string
          company_size?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          department?: string | null
          employee_count?: string | null
          engagement_state?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          fit_score?: number | null
          icp_score?: number | null
          id?: string
          industry?: string | null
          intent_label?: string | null
          intent_reasons?: string[] | null
          intent_score?: number | null
          job_title?: string | null
          last_contacted_at?: string | null
          lead_status?: string
          linkedin_url?: string | null
          notes?: string | null
          recommended_angle?: string | null
          research_brief?: Json | null
          research_confidence?: string | null
          research_sources?: string[] | null
          researched_at?: string | null
          score_breakdown?: Json | null
          score_changed_at?: string | null
          score_reason?: string | null
          scored_at?: string | null
          seniority?: string | null
          signal_date?: string | null
          signal_layers?: Json | null
          signal_score?: number | null
          signal_type?: string | null
          signals?: string[] | null
          source?: string | null
          technologies?: string[] | null
          tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_revenue?: string | null
          company_description?: string | null
          company_linkedin?: string | null
          company_name?: string
          company_size?: string | null
          company_website?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          department?: string | null
          employee_count?: string | null
          engagement_state?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          fit_score?: number | null
          icp_score?: number | null
          id?: string
          industry?: string | null
          intent_label?: string | null
          intent_reasons?: string[] | null
          intent_score?: number | null
          job_title?: string | null
          last_contacted_at?: string | null
          lead_status?: string
          linkedin_url?: string | null
          notes?: string | null
          recommended_angle?: string | null
          research_brief?: Json | null
          research_confidence?: string | null
          research_sources?: string[] | null
          researched_at?: string | null
          score_breakdown?: Json | null
          score_changed_at?: string | null
          score_reason?: string | null
          scored_at?: string | null
          seniority?: string | null
          signal_date?: string | null
          signal_layers?: Json | null
          signal_score?: number | null
          signal_type?: string | null
          signals?: string[] | null
          source?: string | null
          technologies?: string[] | null
          tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      login_history: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          login_method: string
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_method?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_method?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mailbox_warmup: {
        Row: {
          created_at: string
          current_week: number | null
          email: string
          id: string
          start_date: string | null
          user_id: string
          warmup_active: boolean | null
        }
        Insert: {
          created_at?: string
          current_week?: number | null
          email: string
          id?: string
          start_date?: string | null
          user_id: string
          warmup_active?: boolean | null
        }
        Update: {
          created_at?: string
          current_week?: number | null
          email?: string
          id?: string
          start_date?: string | null
          user_id?: string
          warmup_active?: boolean | null
        }
        Relationships: []
      }
      message_blocks: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_shared: boolean
          name: string
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      objection_entries: {
        Row: {
          competitor_name: string | null
          created_at: string
          do_not_say: string[]
          id: string
          label: string | null
          positioning: string | null
          proof_points: Json
          strengths: string | null
          talk_track: string | null
          trigger_terms: string[]
          type: string
          updated_at: string
          user_id: string
          weaknesses: string | null
        }
        Insert: {
          competitor_name?: string | null
          created_at?: string
          do_not_say?: string[]
          id?: string
          label?: string | null
          positioning?: string | null
          proof_points?: Json
          strengths?: string | null
          talk_track?: string | null
          trigger_terms?: string[]
          type: string
          updated_at?: string
          user_id: string
          weaknesses?: string | null
        }
        Update: {
          competitor_name?: string | null
          created_at?: string
          do_not_say?: string[]
          id?: string
          label?: string | null
          positioning?: string | null
          proof_points?: Json
          strengths?: string | null
          talk_track?: string | null
          trigger_terms?: string[]
          type?: string
          updated_at?: string
          user_id?: string
          weaknesses?: string | null
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          added_first_lead: boolean
          completed_profile: boolean
          completed_tour: boolean
          created_at: string
          created_first_deal: boolean
          id: string
          set_up_integration: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          added_first_lead?: boolean
          completed_profile?: boolean
          completed_tour?: boolean
          created_at?: string
          created_first_deal?: boolean
          id?: string
          set_up_integration?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          added_first_lead?: boolean
          completed_profile?: boolean
          completed_tour?: boolean
          created_at?: string
          created_first_deal?: boolean
          id?: string
          set_up_integration?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payoff_bank: {
        Row: {
          asserts_stat: boolean
          content: string
          created_at: string
          id: string
          source_of_truth: string | null
          source_url: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asserts_stat?: boolean
          content: string
          created_at?: string
          id?: string
          source_of_truth?: string | null
          source_url?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asserts_stat?: boolean
          content?: string
          created_at?: string
          id?: string
          source_of_truth?: string | null
          source_url?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          created_at: string
          function: string | null
          id: string
          label: string
          required: boolean
          seniority_band: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          function?: string | null
          id?: string
          label: string
          required?: boolean
          seniority_band?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          function?: string | null
          id?: string
          label?: string
          required?: boolean
          seniority_band?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      placement_results: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          placement: string
          provider: string
          test_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          placement?: string
          provider: string
          test_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          placement?: string
          provider?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "placement_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_tests: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          sending_account_id: string | null
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          sending_account_id?: string | null
          status?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          sending_account_id?: string | null
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_tests_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_description: string | null
          company_name: string | null
          created_at: string
          email: string
          email_signature: string | null
          full_name: string | null
          id: string
          include_compliance_footer: boolean | null
          include_unsubscribe: boolean | null
          last_sign_in_at: string | null
          physical_address: string | null
          signup_source: string | null
          social_proof: string | null
          updated_at: string
        }
        Insert: {
          business_description?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          email_signature?: string | null
          full_name?: string | null
          id: string
          include_compliance_footer?: boolean | null
          include_unsubscribe?: boolean | null
          last_sign_in_at?: string | null
          physical_address?: string | null
          signup_source?: string | null
          social_proof?: string | null
          updated_at?: string
        }
        Update: {
          business_description?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          email_signature?: string | null
          full_name?: string | null
          id?: string
          include_compliance_footer?: boolean | null
          include_unsubscribe?: boolean | null
          last_sign_in_at?: string | null
          physical_address?: string | null
          signup_source?: string | null
          social_proof?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh_key: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh_key: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh_key?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          last_refill_at: string
          tokens: number
          updated_at: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          last_refill_at?: string
          tokens?: number
          updated_at?: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_refill_at?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      re_engagement_log: {
        Row: {
          attempted_at: string
          created_at: string
          days_inactive: number | null
          eligibility_reason: string
          error_message: string | null
          id: string
          last_sign_in_at: string | null
          recipient_email: string
          status: string
          triggered_by: string | null
          triggered_manually: boolean
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          created_at?: string
          days_inactive?: number | null
          eligibility_reason: string
          error_message?: string | null
          id?: string
          last_sign_in_at?: string | null
          recipient_email: string
          status: string
          triggered_by?: string | null
          triggered_manually?: boolean
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          created_at?: string
          days_inactive?: number | null
          eligibility_reason?: string
          error_message?: string | null
          id?: string
          last_sign_in_at?: string | null
          recipient_email?: string
          status?: string
          triggered_by?: string | null
          triggered_manually?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      reply_analysis: {
        Row: {
          agent_reply_sent_at: string | null
          analyzed_at: string
          created_at: string
          detected_signals: Json | null
          id: string
          intent_classification: string | null
          intent_score: number | null
          lead_id: string | null
          processed_by_agent: boolean | null
          reply_content: string | null
          requires_human_action: boolean
          sent_email_id: string | null
          triage_category: string | null
          user_id: string
        }
        Insert: {
          agent_reply_sent_at?: string | null
          analyzed_at?: string
          created_at?: string
          detected_signals?: Json | null
          id?: string
          intent_classification?: string | null
          intent_score?: number | null
          lead_id?: string | null
          processed_by_agent?: boolean | null
          reply_content?: string | null
          requires_human_action?: boolean
          sent_email_id?: string | null
          triage_category?: string | null
          user_id: string
        }
        Update: {
          agent_reply_sent_at?: string | null
          analyzed_at?: string
          created_at?: string
          detected_signals?: Json | null
          id?: string
          intent_classification?: string | null
          intent_score?: number | null
          lead_id?: string | null
          processed_by_agent?: boolean | null
          reply_content?: string | null
          requires_human_action?: boolean
          sent_email_id?: string | null
          triage_category?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_analysis_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_analysis_sent_email_id_fkey"
            columns: ["sent_email_id"]
            isOneToOne: false
            referencedRelation: "sent_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_threads: {
        Row: {
          classification: string | null
          created_at: string
          id: string
          lead_id: string | null
          original_email_body: string | null
          read: boolean | null
          replied_at: string | null
          reply_body: string | null
          sender_email: string
          subject: string
          user_id: string
        }
        Insert: {
          classification?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          original_email_body?: string | null
          read?: boolean | null
          replied_at?: string | null
          reply_body?: string | null
          sender_email: string
          subject: string
          user_id: string
        }
        Update: {
          classification?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          original_email_body?: string | null
          read?: boolean | null
          replied_at?: string | null
          reply_body?: string | null
          sender_email?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_threads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_snapshots: {
        Row: {
          bounce_rate: number
          complaint_rate: number
          created_at: string
          id: string
          open_rate: number
          reputation_score: number | null
          sending_account_id: string
          snapshot_date: string
          user_id: string
          volume: number
        }
        Insert: {
          bounce_rate?: number
          complaint_rate?: number
          created_at?: string
          id?: string
          open_rate?: number
          reputation_score?: number | null
          sending_account_id: string
          snapshot_date?: string
          user_id: string
          volume?: number
        }
        Update: {
          bounce_rate?: number
          complaint_rate?: number
          created_at?: string
          id?: string
          open_rate?: number
          reputation_score?: number | null
          sending_account_id?: string
          snapshot_date?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "reputation_snapshots_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      rescore_queue: {
        Row: {
          enqueued_at: string
          id: string
          lead_id: string
          processed_at: string | null
          reason: string
          status: string
          user_id: string
        }
        Insert: {
          enqueued_at?: string
          id?: string
          lead_id: string
          processed_at?: string | null
          reason?: string
          status?: string
          user_id: string
        }
        Update: {
          enqueued_at?: string
          id?: string
          lead_id?: string
          processed_at?: string | null
          reason?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rescore_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      rl_buckets: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      scheduled_imports: {
        Row: {
          created_at: string
          field_mappings: Json | null
          id: string
          integration_id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string
          schedule_frequency: string
          search_query: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          field_mappings?: Json | null
          id?: string
          integration_id: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at: string
          schedule_frequency: string
          search_query: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          field_mappings?: Json | null
          id?: string
          integration_id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string
          schedule_frequency?: string
          search_query?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scoring_rubric: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          weights?: Json
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          weights?: Json
        }
        Relationships: []
      }
      search_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sending_accounts: {
        Row: {
          auto_pause_threshold: number
          created_at: string
          daily_limit: number
          email: string
          id: string
          integration_id: string | null
          last_sent_at: string | null
          max_send_delay_seconds: number
          min_send_delay_seconds: number
          paused_reason: string | null
          provider: string | null
          reputation_score: number | null
          sent_today: number
          sent_today_date: string
          status: string
          updated_at: string
          user_id: string
          warmup_enabled: boolean
        }
        Insert: {
          auto_pause_threshold?: number
          created_at?: string
          daily_limit?: number
          email: string
          id?: string
          integration_id?: string | null
          last_sent_at?: string | null
          max_send_delay_seconds?: number
          min_send_delay_seconds?: number
          paused_reason?: string | null
          provider?: string | null
          reputation_score?: number | null
          sent_today?: number
          sent_today_date?: string
          status?: string
          updated_at?: string
          user_id: string
          warmup_enabled?: boolean
        }
        Update: {
          auto_pause_threshold?: number
          created_at?: string
          daily_limit?: number
          email?: string
          id?: string
          integration_id?: string | null
          last_sent_at?: string | null
          max_send_delay_seconds?: number
          min_send_delay_seconds?: number
          paused_reason?: string | null
          provider?: string | null
          reputation_score?: number | null
          sent_today?: number
          sent_today_date?: string
          status?: string
          updated_at?: string
          user_id?: string
          warmup_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sending_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_domains: {
        Row: {
          created_at: string
          dkim_selector: string | null
          dkim_status: string
          dmarc_status: string
          domain: string
          id: string
          last_checked_at: string | null
          recommended_records: Json
          spf_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dkim_selector?: string | null
          dkim_status?: string
          dmarc_status?: string
          domain: string
          id?: string
          last_checked_at?: string | null
          recommended_records?: Json
          spf_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dkim_selector?: string | null
          dkim_status?: string
          dmarc_status?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          recommended_records?: Json
          spf_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sent_emails: {
        Row: {
          agent_last_synced_at: string | null
          agent_thread_status: string | null
          body_html: string | null
          body_text: string | null
          clicked_at: string | null
          created_at: string | null
          enrollment_id: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          lead_id: string | null
          opened_at: string | null
          replied_at: string | null
          scheduled_at: string | null
          sending_account_id: string | null
          sent_at: string | null
          sequence_id: string | null
          sequence_step: number | null
          status: string | null
          subject: string
          template_id: string | null
          to_email: string
          tracking_pixel_id: string | null
          user_id: string
        }
        Insert: {
          agent_last_synced_at?: string | null
          agent_thread_status?: string | null
          body_html?: string | null
          body_text?: string | null
          clicked_at?: string | null
          created_at?: string | null
          enrollment_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          replied_at?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          sequence_step?: number | null
          status?: string | null
          subject: string
          template_id?: string | null
          to_email: string
          tracking_pixel_id?: string | null
          user_id: string
        }
        Update: {
          agent_last_synced_at?: string | null
          agent_thread_status?: string | null
          body_html?: string | null
          body_text?: string | null
          clicked_at?: string | null
          created_at?: string | null
          enrollment_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          replied_at?: string | null
          scheduled_at?: string | null
          sending_account_id?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          sequence_step?: number | null
          status?: string | null
          subject?: string
          template_id?: string | null
          to_email?: string
          tracking_pixel_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_emails_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_emails_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_emails_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "template_performance"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "sent_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "user_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audit_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          issues_found: number | null
          kind: string
          new_issues: number | null
          pages_checked: number | null
          resolved_issues: number | null
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number | null
          kind: string
          new_issues?: number | null
          pages_checked?: number | null
          resolved_issues?: number | null
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          issues_found?: number | null
          kind?: string
          new_issues?: number | null
          pages_checked?: number | null
          resolved_issues?: number | null
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      seo_issues: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          category: string
          description: string | null
          details: Json | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_run_id: string | null
          last_seen_at: string
          notified_at: string | null
          resolved_at: string | null
          severity: string
          title: string
          url: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category: string
          description?: string | null
          details?: Json | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_run_id?: string | null
          last_seen_at?: string
          notified_at?: string | null
          resolved_at?: string | null
          severity?: string
          title: string
          url?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category?: string
          description?: string | null
          details?: Json | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_run_id?: string | null
          last_seen_at?: string
          notified_at?: string | null
          resolved_at?: string | null
          severity?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_issues_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "seo_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          engagement_state: string
          enrolled_at: string
          id: string
          last_activity_at: string | null
          lead_id: string
          next_action_at: string | null
          paused_reason: string | null
          sequence_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          engagement_state?: string
          enrolled_at?: string
          id?: string
          last_activity_at?: string | null
          lead_id: string
          next_action_at?: string | null
          paused_reason?: string | null
          sequence_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          engagement_state?: string
          enrolled_at?: string
          id?: string
          last_activity_at?: string | null
          lead_id?: string
          next_action_at?: string | null
          paused_reason?: string | null
          sequence_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body_template: string
          branch_config: Json | null
          created_at: string
          delay_days: number
          delay_hours: number
          id: string
          is_active: boolean
          sequence_id: string
          step_number: number
          step_type: string
          subject_template: string
          trigger_condition: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body_template: string
          branch_config?: Json | null
          created_at?: string
          delay_days?: number
          delay_hours?: number
          id?: string
          is_active?: boolean
          sequence_id: string
          step_number: number
          step_type?: string
          subject_template: string
          trigger_condition?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body_template?: string
          branch_config?: Json | null
          created_at?: string
          delay_days?: number
          delay_hours?: number
          id?: string
          is_active?: boolean
          sequence_id?: string
          step_number?: number
          step_type?: string
          subject_template?: string
          trigger_condition?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_events: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          metadata: Json
          occurred_at: string
          signal_type: string
          source: string | null
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json
          occurred_at?: string
          signal_type: string
          source?: string | null
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
          occurred_at?: string
          signal_type?: string
          source?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "signal_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_diagnostics: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          message: string | null
          source: string
          sqlstate: string | null
          stage: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          message?: string | null
          source?: string
          sqlstate?: string | null
          stage: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          message?: string | null
          source?: string
          sqlstate?: string | null
          stage?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          account_status: string | null
          addon_price_id: string | null
          auto_pause_reason: string | null
          auto_paused_at: string | null
          auto_resume_reason: string | null
          auto_resumed_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          credits_reset_at: string | null
          current_period_end: string
          current_period_start: string
          daily_email_limit: number
          daily_emails_reset_at: string | null
          daily_emails_sent: number
          daily_searches_reset_at: string | null
          daily_searches_used: number
          failed_invoice_count: number
          grace_period_ends_at: string | null
          grace_started_at: string | null
          id: string
          last_payment_error: string | null
          last_stripe_event_at: string | null
          last_stripe_event_id: string | null
          leads_limit: number
          payment_failed_at: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          search_credits_addon: number
          search_credits_base: number
          search_credits_remaining: number
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end_date: string | null
          trial_warning_1d_sent: boolean | null
          trial_warning_3d_sent: boolean | null
          trial_warning_7d_sent: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string | null
          addon_price_id?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          auto_resume_reason?: string | null
          auto_resumed_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_reset_at?: string | null
          current_period_end?: string
          current_period_start?: string
          daily_email_limit?: number
          daily_emails_reset_at?: string | null
          daily_emails_sent?: number
          daily_searches_reset_at?: string | null
          daily_searches_used?: number
          failed_invoice_count?: number
          grace_period_ends_at?: string | null
          grace_started_at?: string | null
          id?: string
          last_payment_error?: string | null
          last_stripe_event_at?: string | null
          last_stripe_event_id?: string | null
          leads_limit?: number
          payment_failed_at?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          search_credits_addon?: number
          search_credits_base?: number
          search_credits_remaining?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end_date?: string | null
          trial_warning_1d_sent?: boolean | null
          trial_warning_3d_sent?: boolean | null
          trial_warning_7d_sent?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string | null
          addon_price_id?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          auto_resume_reason?: string | null
          auto_resumed_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_reset_at?: string | null
          current_period_end?: string
          current_period_start?: string
          daily_email_limit?: number
          daily_emails_reset_at?: string | null
          daily_emails_sent?: number
          daily_searches_reset_at?: string | null
          daily_searches_used?: number
          failed_invoice_count?: number
          grace_period_ends_at?: string | null
          grace_started_at?: string | null
          id?: string
          last_payment_error?: string | null
          last_stripe_event_at?: string | null
          last_stripe_event_id?: string | null
          leads_limit?: number
          payment_failed_at?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          search_credits_addon?: number
          search_credits_base?: number
          search_credits_remaining?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end_date?: string | null
          trial_warning_1d_sent?: boolean | null
          trial_warning_3d_sent?: boolean | null
          trial_warning_7d_sent?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_access_events: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          grant_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          grant_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          grant_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_events_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "support_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_grants: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string
          granted_at: string
          id: string
          request_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          granted_at?: string
          id?: string
          request_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          granted_at?: string
          id?: string
          request_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_grants_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "campaign_setup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          id: string
          message: string
          related_entity: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          related_entity?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          related_entity?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json | null
          severity: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
          severity?: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          severity?: string
        }
        Relationships: []
      }
      team_activity_log: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          team_owner_id: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          team_owner_id: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          team_owner_id?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          member_email: string
          member_user_id: string | null
          role: string
          status: string
          team_owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_email: string
          member_user_id?: string | null
          role?: string
          status?: string
          team_owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_email?: string
          member_user_id?: string | null
          role?: string
          status?: string
          team_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      topup_payments: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          prospects_added: number
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          id?: string
          prospects_added: number
          stripe_session_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          prospects_added?: number
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tracking_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          last_checked_at: string | null
          status: string
          target: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          last_checked_at?: string | null
          status?: string
          target: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          last_checked_at?: string | null
          status?: string
          target?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      user_activation: {
        Row: {
          cohort: string
          completed_onboarding_at: string | null
          current_stage: string
          first_email_sent_at: string | null
          first_lead_saved_at: string | null
          first_search_at: string | null
          last_nudge_sent: string | null
          last_nudge_sent_at: string | null
          mailbox_connected_at: string | null
          milestones_hit: number
          signed_up_at: string
          updated_at: string
          user_id: string
          verified_email_at: string | null
        }
        Insert: {
          cohort?: string
          completed_onboarding_at?: string | null
          current_stage?: string
          first_email_sent_at?: string | null
          first_lead_saved_at?: string | null
          first_search_at?: string | null
          last_nudge_sent?: string | null
          last_nudge_sent_at?: string | null
          mailbox_connected_at?: string | null
          milestones_hit?: number
          signed_up_at?: string
          updated_at?: string
          user_id: string
          verified_email_at?: string | null
        }
        Update: {
          cohort?: string
          completed_onboarding_at?: string | null
          current_stage?: string
          first_email_sent_at?: string | null
          first_lead_saved_at?: string | null
          first_search_at?: string | null
          last_nudge_sent?: string | null
          last_nudge_sent_at?: string | null
          mailbox_connected_at?: string | null
          milestones_hit?: number
          signed_up_at?: string
          updated_at?: string
          user_id?: string
          verified_email_at?: string | null
        }
        Relationships: []
      }
      user_email_templates: {
        Row: {
          created_at: string
          goal: string | null
          id: string
          name: string
          social_proof: string | null
          suggested_subject: string | null
          trigger_context: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal?: string | null
          id?: string
          name: string
          social_proof?: string | null
          suggested_subject?: string | null
          trigger_context?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string | null
          id?: string
          name?: string
          social_proof?: string | null
          suggested_subject?: string | null
          trigger_context?: string | null
          updated_at?: string
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
        Relationships: []
      }
      warmup_messages: {
        Row: {
          created_at: string
          folder_detected: string | null
          from_account_id: string | null
          from_user_id: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          replied_at: string | null
          sent_at: string
          subject: string | null
          to_account_id: string | null
          to_user_id: string | null
        }
        Insert: {
          created_at?: string
          folder_detected?: string | null
          from_account_id?: string | null
          from_user_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          replied_at?: string | null
          sent_at?: string
          subject?: string | null
          to_account_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          created_at?: string
          folder_detected?: string | null
          from_account_id?: string | null
          from_user_id?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          replied_at?: string | null
          sent_at?: string
          subject?: string | null
          to_account_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warmup_messages_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_messages_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_pool: {
        Row: {
          active: boolean
          daily_target: number
          email: string
          id: string
          joined_at: string
          reputation_score: number | null
          sending_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          daily_target?: number
          email: string
          id?: string
          joined_at?: string
          reputation_score?: number | null
          sending_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          daily_target?: number
          email?: string
          id?: string
          joined_at?: string
          reputation_score?: number | null
          sending_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_pool_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: true
            referencedRelation: "sending_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          event: string
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string
          user_id: string | null
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          user_id?: string | null
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          event?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          user_id?: string | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_tests: {
        Row: {
          created_at: string
          expected_response_contains: string | null
          expected_status_code: number | null
          id: string
          last_run_at: string | null
          passed: boolean | null
          test_name: string
          test_payload: Json
          test_result: Json | null
          validate_signature: boolean
          webhook_id: string
        }
        Insert: {
          created_at?: string
          expected_response_contains?: string | null
          expected_status_code?: number | null
          id?: string
          last_run_at?: string | null
          passed?: boolean | null
          test_name: string
          test_payload: Json
          test_result?: Json | null
          validate_signature?: boolean
          webhook_id: string
        }
        Update: {
          created_at?: string
          expected_response_contains?: string | null
          expected_status_code?: number | null
          id?: string
          last_run_at?: string | null
          passed?: boolean | null
          test_name?: string
          test_payload?: Json
          test_result?: Json | null
          validate_signature?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_tests_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_tests_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret: string
          total_triggers: number
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          events: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret: string
          total_triggers?: number
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret?: string
          total_triggers?: number
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      white_label_settings: {
        Row: {
          accent_color: string | null
          company_name: string | null
          created_at: string
          custom_domain: string | null
          domain_verification_token: string | null
          domain_verified: boolean | null
          id: string
          logo_url: string | null
          primary_color: string | null
          referral_code: string | null
          secondary_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_verification_token?: string | null
          domain_verified?: boolean | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          referral_code?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_verification_token?: string | null
          domain_verified?: boolean | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          referral_code?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          action: string
          active: boolean
          created_at: string
          edges: Json | null
          id: string
          name: string
          nodes: Json | null
          trigger: string
          updated_at: string
          user_id: string
          workflow_type: string | null
        }
        Insert: {
          action: string
          active?: boolean
          created_at?: string
          edges?: Json | null
          id?: string
          name: string
          nodes?: Json | null
          trigger: string
          updated_at?: string
          user_id: string
          workflow_type?: string | null
        }
        Update: {
          action?: string
          active?: boolean
          created_at?: string
          edges?: Json | null
          id?: string
          name?: string
          nodes?: Json | null
          trigger?: string
          updated_at?: string
          user_id?: string
          workflow_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      template_performance: {
        Row: {
          click_rate: number | null
          open_rate: number | null
          reply_rate: number | null
          template_id: string | null
          template_name: string | null
          total_clicked: number | null
          total_opened: number | null
          total_replied: number | null
          total_sent: number | null
          user_id: string | null
        }
        Relationships: []
      }
      webhooks_safe: {
        Row: {
          created_at: string | null
          events: string[] | null
          has_secret: boolean | null
          id: string | null
          is_active: boolean | null
          last_triggered_at: string | null
          name: string | null
          secret_masked: string | null
          total_triggers: number | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          events?: string[] | null
          has_secret?: never
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          secret_masked?: never
          total_triggers?: number | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          events?: string[] | null
          has_secret?: never
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          secret_masked?: never
          total_triggers?: number | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_get_activation_dropoff_alerts: {
        Args: never
        Returns: {
          alert_type: string
          current_stage: string
          days_since: number
          email: string
          milestones_hit: number
          signed_up_at: string
          user_id: string
        }[]
      }
      admin_get_activation_funnel: { Args: { _days?: number }; Returns: Json }
      admin_get_all_subscriptions: {
        Args: never
        Returns: {
          account_status: string
          created_at: string
          current_period_end: string
          email: string
          full_name: string
          last_sign_in_at: string
          leads_limit: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          signup_source: string
          status: string
          stripe_customer_id: string
          trial_end_date: string
          user_id: string
        }[]
      }
      admin_get_billing_audit: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _source?: string
        }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          details: Json
          event_at: string
          id: string
          source: string
          status: string
          target_email: string
          target_user_id: string
        }[]
      }
      admin_get_billing_issues: {
        Args: { _include_resolved?: boolean }
        Returns: {
          account_status: string
          alert_id: string
          cancel_at_period_end: boolean
          category: string
          created_at: string
          current_period_end: string
          details: Json
          email: string
          full_name: string
          is_locked: boolean
          message: string
          payment_failed_at: string
          plan: string
          resolved: boolean
          severity: string
          subscription_status: string
          user_id: string
        }[]
      }
      admin_get_cron_runs: {
        Args: { jobnames: string[] }
        Returns: {
          jobname: string
          last_run: string
          last_status: string
          last_success: string
        }[]
      }
      admin_get_dashboard_stats: {
        Args: never
        Returns: {
          active_subscriptions: number
          active_trials: number
          locked_accounts: number
          monthly_revenue: number
          total_revenue: number
          total_users: number
        }[]
      }
      admin_get_email_send_logs: {
        Args: { _limit?: number; _since?: string }
        Returns: {
          created_at: string
          error_message: string
          id: string
          message_id: string
          metadata: Json
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      admin_get_realtime_status: {
        Args: never
        Returns: {
          in_publication: boolean
          replica_identity: string
          table_name: string
        }[]
      }
      admin_get_seo_dashboard: { Args: never; Returns: Json }
      admin_get_user_timeline: {
        Args: { _user_id: string }
        Returns: {
          description: string
          event_at: string
          event_type: string
          meta: Json
        }[]
      }
      admin_list_activation_users: {
        Args: { _cohort?: string; _days?: number; _limit?: number }
        Returns: {
          cohort: string
          completed_onboarding_at: string
          current_stage: string
          days_since_signup: number
          email: string
          first_email_sent_at: string
          first_lead_saved_at: string
          first_search_at: string
          full_name: string
          mailbox_connected_at: string
          milestones_hit: number
          plan: string
          signed_up_at: string
          user_id: string
          verified_email_at: string
        }[]
      }
      admin_lock_user: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      admin_realtime_heartbeat: { Args: never; Returns: string }
      admin_set_admin: {
        Args: { _make_admin: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_trial: {
        Args: { _trial_days?: number; _user_id: string }
        Returns: undefined
      }
      admin_unlock_user: { Args: { _user_id: string }; Returns: undefined }
      admin_update_subscription: {
        Args: {
          _plan: Database["public"]["Enums"]["subscription_plan"]
          _status?: string
          _user_id: string
        }
        Returns: undefined
      }
      admin_upsert_vault_secret: {
        Args: { _name: string; _secret: string }
        Returns: undefined
      }
      apply_stripe_event_to_subscription: {
        Args: {
          _event_created_at: string
          _event_id: string
          _updates: Json
          _user_id: string
        }
        Returns: {
          applied: boolean
          reason: string
        }[]
      }
      billing_bump_failed_invoice_count: {
        Args: { _user_id: string }
        Returns: number
      }
      billing_expire_grace_periods: {
        Args: never
        Returns: {
          paused: boolean
          user_id: string
        }[]
      }
      billing_record_auto_pause: {
        Args: { _details?: Json; _reason: string; _user_id: string }
        Returns: undefined
      }
      billing_record_auto_resume: {
        Args: { _details?: Json; _reason?: string; _user_id: string }
        Returns: boolean
      }
      billing_reset_failed_invoice_count: {
        Args: { _user_id: string }
        Returns: undefined
      }
      billing_start_grace_period: {
        Args: {
          _days?: number
          _details?: Json
          _reason?: string
          _user_id: string
        }
        Returns: string
      }
      check_expiring_api_keys: { Args: never; Returns: undefined }
      claim_stripe_webhook_event: {
        Args: {
          _event_id: string
          _event_type: string
          _idempotency_key?: string
          _payload: Json
        }
        Returns: {
          already_succeeded: boolean
          attempts: number
          claimed: boolean
          in_progress: boolean
          max_attempts: number
          row_id: string
        }[]
      }
      cleanup_expired_cache: { Args: never; Returns: undefined }
      cleanup_rl_buckets: { Args: never; Returns: undefined }
      consume_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      current_month_start_utc: { Args: never; Returns: string }
      deduct_search_credits: {
        Args: { _amount: number; _description?: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      deliverability_call_edge: {
        Args: { p_function_name: string; p_payload?: Json }
        Returns: number
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_api_key_value: { Args: { _id: string }; Returns: string }
      get_email_send_trend: {
        Args: { _days?: number }
        Returns: {
          day: string
          sent: number
        }[]
      }
      get_expiring_trials: {
        Args: { _days_until_expiry: number }
        Returns: {
          days_remaining: number
          email: string
          full_name: string
          trial_end_date: string
          user_id: string
        }[]
      }
      get_maintenance_message: { Args: never; Returns: string }
      get_maintenance_status: { Args: never; Returns: boolean }
      get_monthly_email_limit: {
        Args: { _plan: Database["public"]["Enums"]["subscription_plan"] }
        Returns: number
      }
      get_monthly_email_usage: {
        Args: never
        Returns: {
          daily_limit: number
          daily_remaining: number
          daily_sent: number
          monthly_limit: number
          monthly_remaining: number
          monthly_reset_at: string
          monthly_sent: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }[]
      }
      get_my_referral_code: { Args: never; Returns: string }
      get_reputation_inputs: {
        Args: { p_days?: number }
        Returns: {
          bounced: number
          complaints: number
          opened: number
          sending_account_id: string
          sent: number
          user_id: string
        }[]
      }
      get_sequence_monthly_usage: {
        Args: never
        Returns: {
          sent_this_month: number
          sequence_id: string
          sequence_name: string
        }[]
      }
      get_user_leads_usage: {
        Args: never
        Returns: {
          leads_count: number
          leads_limit: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }[]
      }
      get_user_plan: {
        Args: never
        Returns: {
          has_ai_coach: boolean
          has_analytics: boolean
          has_api_access: boolean
          has_automations: boolean
          leads_limit: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }[]
      }
      get_webhook_secret: { Args: { webhook_id: string }; Returns: string }
      has_active_support_grant: {
        Args: { _scope?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_account_send: {
        Args: { p_account_id: string }
        Returns: boolean
      }
      increment_daily_emails_sent: {
        Args: { _user_id: string }
        Returns: undefined
      }
      lock_expired_trials: { Args: never; Returns: undefined }
      log_security_event: {
        Args: {
          _details?: Json
          _event_type: string
          _ip_address?: string
          _severity?: string
          _user_agent?: string
          _user_id?: string
        }
        Returns: string
      }
      log_signup_event: {
        Args: {
          _details?: Json
          _email?: string
          _message?: string
          _source?: string
          _stage?: string
          _status?: string
          _user_id: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_month_start_utc: { Args: never; Returns: string }
      pick_sending_account: { Args: { p_user_id: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_activation: { Args: { _user_id: string }; Returns: undefined }
      record_user_login: {
        Args: {
          p_ip_address?: string
          p_login_method?: string
          p_status?: string
          p_user_agent?: string
          p_user_email?: string
          p_user_id: string
        }
        Returns: undefined
      }
      reset_daily_email_counters: { Args: never; Returns: undefined }
      seed_objection_entries: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      seed_personas: { Args: { p_user_id: string }; Returns: undefined }
      touch_last_active: { Args: never; Returns: undefined }
      trg_activation_ensure_row: {
        Args: { _signed_up: string; _uid: string }
        Returns: undefined
      }
      trigger_rescore_queue: { Args: never; Returns: undefined }
      webhook_has_secret: { Args: { _webhook_id: string }; Returns: boolean }
      webhook_secret_masked: { Args: { _webhook_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      subscription_plan:
        | "free"
        | "starter"
        | "growth"
        | "pro"
        | "elite"
        | "agency"
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
      app_role: ["admin", "user"],
      subscription_plan: [
        "free",
        "starter",
        "growth",
        "pro",
        "elite",
        "agency",
      ],
    },
  },
} as const
