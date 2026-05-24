ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'recalled', 'deleted'));
