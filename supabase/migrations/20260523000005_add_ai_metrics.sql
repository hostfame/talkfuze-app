ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE public.ai_draft_logs ADD COLUMN IF NOT EXISTS temperature NUMERIC;
