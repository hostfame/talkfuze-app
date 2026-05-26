-- Create agent_activity_heartbeats table to track silent agent active presence
CREATE TABLE IF NOT EXISTS public.agent_activity_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast daily/weekly leaderboard queries
CREATE INDEX IF NOT EXISTS idx_heartbeats_query ON public.agent_activity_heartbeats(org_id, agent_id, created_at);

-- Enable RLS
ALTER TABLE public.agent_activity_heartbeats ENABLE ROW LEVEL SECURITY;

-- Org isolation policy
CREATE POLICY "Org isolation for agent_activity_heartbeats" ON public.agent_activity_heartbeats
    FOR ALL USING (org_id = public.current_org_id());
