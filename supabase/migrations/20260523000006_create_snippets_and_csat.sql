-- Create Canned Replies and CSAT Feedbacks Tables

CREATE TABLE IF NOT EXISTS public.canned_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    shortcut TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id, shortcut)
);

CREATE TABLE IF NOT EXISTS public.csat_feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for Speed
CREATE INDEX IF NOT EXISTS idx_canned_replies_org_id ON public.canned_replies(org_id);
CREATE INDEX IF NOT EXISTS idx_csat_feedbacks_org_id ON public.csat_feedbacks(org_id);
CREATE INDEX IF NOT EXISTS idx_csat_feedbacks_conversation_id ON public.csat_feedbacks(conversation_id);

-- Enable RLS
ALTER TABLE public.canned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csat_feedbacks ENABLE ROW LEVEL SECURITY;

-- Security Policies
CREATE POLICY "Org isolation for canned_replies" ON public.canned_replies
    FOR ALL USING (org_id = public.current_org_id());

CREATE POLICY "Org isolation for csat_feedbacks" ON public.csat_feedbacks
    FOR ALL USING (org_id = public.current_org_id());
