// このファイルは `npm run db:types` で自動生成されます。手動編集禁止。
// 初回は仮の型定義を使用します。Supabase CLI セットアップ後に再生成してください。

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          id: string;
          tenant_id: string;
          role: 'care_manager' | 'admin';
          display_name: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          role?: 'care_manager' | 'admin';
          display_name: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          role?: 'care_manager' | 'admin';
          display_name?: string;
          email?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      care_recipients: {
        Row: {
          id: string;
          tenant_id: string;
          full_name: string;
          date_of_birth: string;
          address: string;
          phone_number: string | null;
          family_members: Json;
          current_care_level:
            | 'support_1'
            | 'support_2'
            | 'care_1'
            | 'care_2'
            | 'care_3'
            | 'care_4'
            | 'care_5';
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          full_name: string;
          date_of_birth: string;
          address: string;
          phone_number?: string | null;
          family_members?: Json;
          current_care_level:
            | 'support_1'
            | 'support_2'
            | 'care_1'
            | 'care_2'
            | 'care_3'
            | 'care_4'
            | 'care_5';
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          date_of_birth?: string;
          address?: string;
          phone_number?: string | null;
          family_members?: Json;
          current_care_level?:
            | 'support_1'
            | 'support_2'
            | 'care_1'
            | 'care_2'
            | 'care_3'
            | 'care_4'
            | 'care_5';
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'care_recipients_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_recipients_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      care_level_histories: {
        Row: {
          id: string;
          tenant_id: string;
          care_recipient_id: string;
          previous_care_level: string | null;
          new_care_level: string;
          changed_at: string;
          reason: string | null;
          recorded_by: string;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          care_recipient_id: string;
          previous_care_level?: string | null;
          new_care_level: string;
          changed_at: string;
          reason?: string | null;
          recorded_by: string;
          recorded_at?: string;
        };
        Update: {
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'care_level_histories_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'care_level_histories_care_recipient_id_fkey';
            columns: ['care_recipient_id'];
            isOneToOne: false;
            referencedRelation: 'care_recipients';
            referencedColumns: ['id'];
          },
        ];
      };
      assessments: {
        Row: {
          id: string;
          tenant_id: string;
          care_recipient_id: string;
          type: 'initial' | 'reassessment';
          status: 'draft' | 'finalized';
          conducted_at: string;
          source_transcript: string;
          masked_summary: string;
          placeholder_map: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
          finalized_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          care_recipient_id: string;
          type: 'initial' | 'reassessment';
          status?: 'draft' | 'finalized';
          conducted_at: string;
          source_transcript: string;
          masked_summary: string;
          placeholder_map: Json;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          finalized_at?: string | null;
          version?: number;
        };
        Update: {
          status?: 'draft' | 'finalized';
          masked_summary?: string;
          placeholder_map?: Json;
          updated_at?: string;
          finalized_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'assessments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_care_recipient_id_fkey';
            columns: ['care_recipient_id'];
            isOneToOne: false;
            referencedRelation: 'care_recipients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      assessment_issues: {
        Row: {
          id: string;
          tenant_id: string;
          assessment_id: string;
          sequence_no: number;
          category: 'health' | 'adl' | 'iadl' | 'cognitive' | 'social' | 'family' | 'other';
          description: string;
          priority: 'high' | 'medium' | 'low';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          assessment_id: string;
          sequence_no: number;
          category: 'health' | 'adl' | 'iadl' | 'cognitive' | 'social' | 'family' | 'other';
          description: string;
          priority: 'high' | 'medium' | 'low';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sequence_no?: number;
          category?: 'health' | 'adl' | 'iadl' | 'cognitive' | 'social' | 'family' | 'other';
          description?: string;
          priority?: 'high' | 'medium' | 'low';
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assessment_issues_assessment_id_fkey';
            columns: ['assessment_id'];
            isOneToOne: false;
            referencedRelation: 'assessments';
            referencedColumns: ['id'];
          },
        ];
      };
      assessment_drafts: {
        Row: {
          id: string;
          tenant_id: string;
          care_recipient_id: string;
          original_text: string;
          masked_text: string;
          placeholder_map: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          care_recipient_id: string;
          original_text: string;
          masked_text: string;
          placeholder_map: Json;
          created_by: string;
          created_at?: string;
        };
        Update: {
          masked_text?: string;
          placeholder_map?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'assessment_drafts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assessment_drafts_care_recipient_id_fkey';
            columns: ['care_recipient_id'];
            isOneToOne: false;
            referencedRelation: 'care_recipients';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_generation_logs: {
        Row: {
          id: string;
          tenant_id: string;
          kind: string;
          original_text: string | null;
          masked_text: string;
          placeholder_map: Json;
          masking_stats: Json | null;
          ai_response: Json;
          ai_model: string | null;
          prompt_template_id: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          created_by: string;
          created_at: string;
          request_tokens: number | null;
          response_tokens: number | null;
          latency_ms: number | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          kind: string;
          original_text?: string | null;
          masked_text: string;
          placeholder_map: Json;
          masking_stats?: Json | null;
          ai_response: Json;
          ai_model?: string | null;
          prompt_template_id?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          created_by: string;
          created_at?: string;
          request_tokens?: number | null;
          response_tokens?: number | null;
          latency_ms?: number | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_assessment: {
        Args: { p_payload: Json };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
