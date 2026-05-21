-- Create ai_draft_logs table to store drafts and agent edits for few-shot learning
CREATE TABLE IF NOT EXISTS public.ai_draft_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ai_draft TEXT NOT NULL,
    agent_sent TEXT,
    was_edited BOOLEAN DEFAULT false NOT NULL,
    language TEXT DEFAULT 'en' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast learning examples retrieval
CREATE INDEX IF NOT EXISTS idx_ai_draft_logs_org_edited ON public.ai_draft_logs(org_id, was_edited, created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_draft_logs ENABLE ROW LEVEL SECURITY;

-- Org isolation policy
CREATE POLICY "Org isolation for ai_draft_logs" ON public.ai_draft_logs
    FOR ALL USING (org_id = public.current_org_id());
