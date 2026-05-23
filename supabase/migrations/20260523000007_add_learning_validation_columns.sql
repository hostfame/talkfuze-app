-- Add dynamic rule validation columns to the ai_draft_logs table for testing & validation loops
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS validation_draft TEXT;
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS validation_score INTEGER;
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS validation_verdict TEXT;
