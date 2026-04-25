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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
