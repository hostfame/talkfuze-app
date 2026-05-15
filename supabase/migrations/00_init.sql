-- TalkFuze Core Schema Initial Migration

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Core Tables
-- ============================================================================

-- Organizations (Tenants)
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Users (Agents & Admins)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
    avatar_url TEXT,
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Channels (Messenger, Widget, IG, etc.)
CREATE TABLE public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('messenger', 'widget', 'instagram', 'tiktok', 'whatsapp')),
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Contacts (End customers messaging the business)
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    platform_id TEXT NOT NULL, -- The ID from Messenger, WhatsApp, or random UUID for widget
    platform_type TEXT NOT NULL CHECK (platform_type IN ('messenger', 'widget', 'instagram', 'tiktok', 'whatsapp')),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id, platform_id, platform_type)
);

-- Conversations
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_type TEXT DEFAULT 'unassigned' CHECK (assigned_type IN ('ai', 'human', 'unassigned')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    subject TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Messages
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'agent', 'ai', 'system')),
    sender_id TEXT, -- User ID, Contact ID, or 'ai'/'system'
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'template', 'note')),
    metadata JSONB DEFAULT '{}'::jsonb,
    platform_message_id TEXT, -- Original message ID from FB/IG to prevent duplicates
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- AI Configurations
CREATE TABLE public.ai_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    model TEXT DEFAULT 'gpt-4o',
    system_prompt TEXT DEFAULT 'You are a helpful customer support assistant.',
    temperature NUMERIC DEFAULT 0.7,
    confidence_threshold NUMERIC DEFAULT 0.8,
    handoff_triggers JSONB DEFAULT '["human", "agent", "support"]'::jsonb,
    tone TEXT DEFAULT 'professional',
    language_preference TEXT DEFAULT 'auto',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id)
);

-- Internal Notes
CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tags
CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#0070f3',
    UNIQUE(org_id, name)
);

CREATE TABLE public.conversation_tags (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, tag_id)
);


-- ============================================================================
-- 2. Indexes for Performance (Critical for RLS and Chat speed)
-- ============================================================================

CREATE INDEX idx_users_org_id ON public.users(org_id);
CREATE INDEX idx_channels_org_id ON public.channels(org_id);
CREATE INDEX idx_contacts_org_id_platform ON public.contacts(org_id, platform_type, platform_id);
CREATE INDEX idx_conversations_org_status ON public.conversations(org_id, status);
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_messages_conversation_id_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org_id ON public.messages(org_id);

-- ============================================================================
-- 3. Row Level Security (RLS) - Pooled Multi-tenant Architecture
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's org_id from JWT claims
-- This assumes we set up auth.jwt() -> app_metadata -> org_id during user sign in.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Organizations
CREATE POLICY "Users can view their own organization"
    ON public.organizations FOR SELECT
    USING (id = public.current_org_id());

-- Users
CREATE POLICY "Users can view colleagues in same org"
    ON public.users FOR SELECT
    USING (org_id = public.current_org_id());

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    USING (id = auth.uid());

-- Universal Policy Pattern for all org-based tables
-- Channels
CREATE POLICY "Org isolation for channels" ON public.channels
    FOR ALL USING (org_id = public.current_org_id());

-- Contacts
CREATE POLICY "Org isolation for contacts" ON public.contacts
    FOR ALL USING (org_id = public.current_org_id());

-- Conversations
CREATE POLICY "Org isolation for conversations" ON public.conversations
    FOR ALL USING (org_id = public.current_org_id());

-- Messages
CREATE POLICY "Org isolation for messages" ON public.messages
    FOR ALL USING (org_id = public.current_org_id());

-- AI Configs
CREATE POLICY "Org isolation for ai_configs" ON public.ai_configs
    FOR ALL USING (org_id = public.current_org_id());

-- Notes
CREATE POLICY "Org isolation for notes" ON public.notes
    FOR ALL USING (org_id = public.current_org_id());

-- Tags
CREATE POLICY "Org isolation for tags" ON public.tags
    FOR ALL USING (org_id = public.current_org_id());

CREATE POLICY "Org isolation for conversation_tags" ON public.conversation_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = conversation_id AND c.org_id = public.current_org_id()
        )
    );

-- Enable realtime for critical tables
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.contacts;
