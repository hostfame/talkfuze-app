export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          plan: string
          settings: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: string
          settings?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: string
          settings?: Json | null
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          org_id: string
          email: string
          name: string
          role: string
          avatar_url: string | null
          status: string
          created_at: string
        }
        Insert: {
          id: string
          org_id: string
          email: string
          name: string
          role?: string
          avatar_url?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          name?: string
          role?: string
          avatar_url?: string | null
          status?: string
          created_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          org_id: string
          type: string
          config: Json | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          type: string
          config?: Json | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          type?: string
          config?: Json | null
          is_active?: boolean
          created_at?: string
        }
      }
      contacts: {
        Row: {
          id: string
          org_id: string
          platform_id: string
          platform_type: string
          name: string
          email: string | null
          phone: string | null
          avatar_url: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          platform_id: string
          platform_type: string
          name: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          platform_id?: string
          platform_type?: string
          name?: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          org_id: string
          channel_id: string
          contact_id: string
          status: string
          assigned_to: string | null
          assigned_type: string
          priority: string
          subject: string | null
          last_message_at: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          channel_id: string
          contact_id: string
          status?: string
          assigned_to?: string | null
          assigned_type?: string
          priority?: string
          subject?: string | null
          last_message_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          channel_id?: string
          contact_id?: string
          status?: string
          assigned_to?: string | null
          assigned_type?: string
          priority?: string
          subject?: string | null
          last_message_at?: string
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          org_id: string
          sender_type: string
          sender_id: string | null
          content: string
          content_type: string
          metadata: Json | null
          platform_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          org_id: string
          sender_type: string
          sender_id?: string | null
          content: string
          content_type?: string
          metadata?: Json | null
          platform_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          org_id?: string
          sender_type?: string
          sender_id?: string | null
          content?: string
          content_type?: string
          metadata?: Json | null
          platform_message_id?: string | null
          created_at?: string
        }
      }
      ai_configs: {
        Row: {
          id: string
          org_id: string
          model: string
          system_prompt: string
          temperature: number
          confidence_threshold: number
          handoff_triggers: Json | null
          tone: string
          language_preference: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          model?: string
          system_prompt?: string
          temperature?: number
          confidence_threshold?: number
          handoff_triggers?: Json | null
          tone?: string
          language_preference?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          model?: string
          system_prompt?: string
          temperature?: number
          confidence_threshold?: number
          handoff_triggers?: Json | null
          tone?: string
          language_preference?: string
          is_active?: boolean
          created_at?: string
        }
      }
    }
  }
}
