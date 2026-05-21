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
          sip_extension: string | null
          sip_password: string | null
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
          sip_extension?: string | null
          sip_password?: string | null
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
          sip_extension?: string | null
          sip_password?: string | null
          created_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          org_id: string
          type: ChannelType
          config: ChannelConfig | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          type: ChannelType
          config?: ChannelConfig | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          type?: ChannelType
          config?: ChannelConfig | null
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
          status: string | null
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
          status?: string | null
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
          status?: string | null
          created_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          org_id: string
          channel_id: string | null
          contact_id: string
          status: string
          assigned_to: string | null
          assigned_type: string
          priority: string
          subject: string | null
          tags: string[] | null
          last_message_at: string
          snoozed_until: string | null
          is_pinned: boolean
          is_unread: boolean
          is_muted: boolean
          is_archived: boolean
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
          tags?: string[] | null
          last_message_at?: string
          snoozed_until?: string | null
          is_pinned?: boolean
          is_unread?: boolean
          is_muted?: boolean
          is_archived?: boolean
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
          tags?: string[] | null
          last_message_at?: string
          snoozed_until?: string | null
          is_pinned?: boolean
          is_unread?: boolean
          is_muted?: boolean
          is_archived?: boolean
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
          metadata: MessageMetadata | null
          platform_message_id: string | null
          is_internal: boolean
          status: string | null
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
          metadata?: MessageMetadata | null
          platform_message_id?: string | null
          is_internal?: boolean
          status?: string | null
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
          metadata?: MessageMetadata | null
          platform_message_id?: string | null
          is_internal?: boolean
          status?: string | null
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
      conversation_participants: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          joined_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          joined_at?: string
        }
      }
      quick_replies: {
        Row: {
          id: string
          org_id: string
          shortcut: string
          title: string
          content: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          shortcut: string
          title: string
          content: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          shortcut?: string
          title?: string
          content?: string
          created_by?: string | null
          created_at?: string
        }
      }
    }
  }
}

export type ChannelType =
  | 'messenger'
  | 'widget'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'settings_quick_replies'
  | 'settings_crm_webhook'
  | 'ai_openai'
  | 'ai_anthropic'
  | 'ai_gemini'

export type QuickReply = {
  id: string
  shortcut: string
  message: string
}

export type ChannelConfig = {
  access_token?: string
  api_key?: string
  enabled?: boolean
  items?: QuickReply[]
  page_id?: string
  page_name?: string
  qr_code?: string | null
  secret?: string
  status?: string
  url?: string
  [key: string]: Json | QuickReply[] | undefined
}

export type MessageMetadata = {
  filename?: string
  media_url?: string
  mimetype?: string
  participant_avatar?: string
  participant_name?: string
  [key: string]: Json | undefined
}

export type Tables = Database['public']['Tables']
export type Organization = Tables['organizations']['Row']
export type UserProfile = Tables['users']['Row']
export type Channel = Tables['channels']['Row']
export type Contact = Tables['contacts']['Row']
export type Conversation = Tables['conversations']['Row']
export type AppMessage = Tables['messages']['Row']
export type ConversationParticipant = Tables['conversation_participants']['Row'] & {
  user?: Pick<UserProfile, 'id' | 'name' | 'avatar_url' | 'role'>
}
export type QuickReplyItem = Tables['quick_replies']['Row']

export type Relation<T> = T | T[] | null

export type ConversationPreviewMessage = Pick<AppMessage, 'content' | 'sender_type' | 'content_type' | 'status'>

export type ConversationWithDetails = Conversation & {
  assignee?: Relation<UserProfile>
  channel?: Relation<Pick<Channel, 'type' | 'config'>>
  channels?: Relation<Pick<Channel, 'type' | 'config'>>
  contact?: Relation<Contact>
  messages?: ConversationPreviewMessage[] | null
  participants?: ConversationParticipant[]
}
