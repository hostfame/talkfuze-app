CREATE TABLE IF NOT EXISTS public.unpaid_invoice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id BIGINT UNIQUE NOT NULL,
  client_id BIGINT NOT NULL,
  status TEXT, 
  will_renew TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.unpaid_invoice_calls ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'unpaid_invoice_calls' 
    AND policyname = 'Allow authenticated access to unpaid_invoice_calls'
  ) THEN
    CREATE POLICY "Allow authenticated access to unpaid_invoice_calls" 
    ON public.unpaid_invoice_calls
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);
  END IF;
END $$;
