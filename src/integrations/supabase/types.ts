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
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
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
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          method: string
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
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
      email_sequences: {
        Row: {
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
          icp_score: number | null
          id: string
          industry: string | null
          job_title: string | null
          last_contacted_at: string | null
          lead_status: string
          linkedin_url: string | null
          notes: string | null
          score_changed_at: string | null
          seniority: string | null
          source: string | null
          technologies: string[] | null
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
          icp_score?: number | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_contacted_at?: string | null
          lead_status?: string
          linkedin_url?: string | null
          notes?: string | null
          score_changed_at?: string | null
          seniority?: string | null
          source?: string | null
          technologies?: string[] | null
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
          icp_score?: number | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_contacted_at?: string | null
          lead_status?: string
          linkedin_url?: string | null
          notes?: string | null
          score_changed_at?: string | null
          seniority?: string | null
          source?: string | null
          technologies?: string[] | null
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
          user_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_method?: string
          status?: string
          user_agent?: string | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_method?: string
          status?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string | null
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
      profiles: {
        Row: {
          business_description: string | null
          company_name: string | null
          created_at: string
          email: string
          email_signature: string | null
          full_name: string | null
          id: string
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
          social_proof?: string | null
          updated_at?: string
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
      reply_analysis: {
        Row: {
          analyzed_at: string
          created_at: string
          detected_signals: Json | null
          id: string
          intent_classification: string | null
          intent_score: number | null
          lead_id: string | null
          reply_content: string | null
          requires_human_action: boolean
          sent_email_id: string | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          created_at?: string
          detected_signals?: Json | null
          id?: string
          intent_classification?: string | null
          intent_score?: number | null
          lead_id?: string | null
          reply_content?: string | null
          requires_human_action?: boolean
          sent_email_id?: string | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          created_at?: string
          detected_signals?: Json | null
          id?: string
          intent_classification?: string | null
          intent_score?: number | null
          lead_id?: string | null
          reply_content?: string | null
          requires_human_action?: boolean
          sent_email_id?: string | null
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
      sent_emails: {
        Row: {
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
        }
        Insert: {
          body_template: string
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
        }
        Update: {
          body_template?: string
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
      subscriptions: {
        Row: {
          account_status: string | null
          addon_price_id: string | null
          created_at: string
          credits_reset_at: string | null
          current_period_end: string
          current_period_start: string
          daily_email_limit: number
          daily_emails_reset_at: string | null
          daily_emails_sent: number
          daily_searches_reset_at: string | null
          daily_searches_used: number
          id: string
          leads_limit: number
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
          created_at?: string
          credits_reset_at?: string | null
          current_period_end?: string
          current_period_start?: string
          daily_email_limit?: number
          daily_emails_reset_at?: string | null
          daily_emails_sent?: number
          daily_searches_reset_at?: string | null
          daily_searches_used?: number
          id?: string
          leads_limit?: number
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
          created_at?: string
          credits_reset_at?: string | null
          current_period_end?: string
          current_period_start?: string
          daily_email_limit?: number
          daily_emails_reset_at?: string | null
          daily_emails_sent?: number
          daily_searches_reset_at?: string | null
          daily_searches_used?: number
          id?: string
          leads_limit?: number
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
      admin_get_all_subscriptions: {
        Args: never
        Returns: {
          account_status: string
          current_period_end: string
          email: string
          full_name: string
          leads_limit: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          status: string
          stripe_customer_id: string
          trial_end_date: string
          user_id: string
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
      admin_lock_user: {
        Args: { _reason?: string; _user_id: string }
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
      check_expiring_api_keys: { Args: never; Returns: undefined }
      cleanup_expired_cache: { Args: never; Returns: undefined }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
    }
    Enums: {
      app_role: "admin" | "user"
      subscription_plan: "free" | "starter" | "growth" | "pro" | "elite"
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
      subscription_plan: ["free", "starter", "growth", "pro", "elite"],
    },
  },
} as const
