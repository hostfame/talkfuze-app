-- AI Training Logs for TalkFuze "Observer" Pipeline

CREATE TABLE IF NOT EXISTS public.ai_training_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    raw_messages_count INT DEFAULT 0,
    distilled_summary TEXT,
    learned_tags JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(conversation_id)
);

-- Enable RLS
ALTER TABLE public.ai_training_logs ENABLE ROW LEVEL SECURITY;

-- Allow org users to view logs
CREATE POLICY "Org isolation for ai_training_logs" ON public.ai_training_logs
    FOR SELECT USING (org_id = public.current_org_id());

-- Only system/service_role can insert/update this table, so we don't need RLS for INSERT/UPDATE right now,
-- but we can add one just in case edge functions use authenticated clients instead of service_role.
CREATE POLICY "Allow system insert on ai_training_logs" ON public.ai_training_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow system update on ai_training_logs" ON public.ai_training_logs
    FOR UPDATE USING (true);

-- ============================================================================
-- The Trigger (pg_cron)
-- Note: pg_cron requires superuser privileges to schedule jobs.
-- If this fails on Supabase UI, run the cron setup from the Supabase SQL Editor as Postgres.
-- ============================================================================

-- Create a function to auto-archive old chats
CREATE OR REPLACE FUNCTION auto_archive_stale_chats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.conversations
    SET status = 'closed'
    WHERE status NOT IN ('closed', 'resolved')
      AND last_message_at < now() - interval '24 hours';
      
    -- Note: When a conversation status is updated to 'closed', we can either use a Postgres Trigger
    -- or a Supabase Database Webhook to trigger the Edge Function for Distillation.
    -- For visual monitoring, let's insert a pending log when a conversation is closed.
    
    INSERT INTO public.ai_training_logs (org_id, conversation_id, status)
    SELECT org_id, id, 'pending'
    FROM public.conversations
    WHERE status = 'closed'
      AND id NOT IN (SELECT conversation_id FROM public.ai_training_logs);
END;
$$;

-- To actually schedule this (Requires pg_cron extension):
-- SELECT cron.schedule('auto-archive-chats', '0 * * * *', 'SELECT auto_archive_stale_chats()');
