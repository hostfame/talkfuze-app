CREATE TABLE IF NOT EXISTS public.ai_permanent_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  rule_text TEXT NOT NULL,
  category TEXT DEFAULT 'style',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.ai_permanent_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on ai_permanent_rules" ON public.ai_permanent_rules FOR SELECT USING (true);
CREATE POLICY "Allow all on ai_permanent_rules" ON public.ai_permanent_rules FOR ALL USING (true);
