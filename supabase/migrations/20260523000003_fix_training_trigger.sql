-- Create a function to auto-insert into ai_training_logs when a conversation is closed
CREATE OR REPLACE FUNCTION public.trigger_ai_training_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If status changed to 'closed' and it wasn't closed before
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    -- Insert a pending log to start the AI distillation pipeline
    INSERT INTO public.ai_training_logs (org_id, conversation_id, status)
    VALUES (NEW.org_id, NEW.id, 'pending')
    ON CONFLICT (conversation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_conversation_closed ON public.conversations;

-- Create the trigger on conversations table
CREATE TRIGGER on_conversation_closed
  AFTER UPDATE OF status ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_training_on_close();

-- Now, backfill the 155 conversations that were already closed but missed the trigger
INSERT INTO public.ai_training_logs (org_id, conversation_id, status)
SELECT org_id, id, 'pending'
FROM public.conversations
WHERE status = 'closed' 
  AND id NOT IN (SELECT conversation_id FROM public.ai_training_logs)
ON CONFLICT (conversation_id) DO NOTHING;
