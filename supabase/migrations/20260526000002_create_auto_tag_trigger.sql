-- Create Webhook/Trigger for AI Auto-Tagging on messages using pg_net
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_auto_tag_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  has_tags boolean;
BEGIN
  -- Only trigger for messages sent by the contact (customer)
  IF NEW.sender_type = 'contact' THEN
    -- Check if the conversation already has tags to avoid redundant HTTP requests
    SELECT (tags IS NOT NULL AND cardinality(tags) > 0) INTO has_tags
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF NOT COALESCE(has_tags, false) THEN
      PERFORM net.http_post(
        url := 'https://fyuymnldgvfvdqcnbsxh.supabase.co/functions/v1/auto-tag',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'messages',
          'schema', 'public',
          'record', row_to_json(NEW)
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_tag_on_new_message ON public.messages;

CREATE TRIGGER tr_auto_tag_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_tag_fn();
