-- Add correction_feedback column to track AI self-correction insight notes
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS correction_feedback TEXT;
