-- Create Webhook for AI Training Logs using pg_net
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_distill_chat_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url := 'https://fyuymnldgvfvdqcnbsxh.supabase.co/functions/v1/distill-chat',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('type', 'INSERT', 'table', 'ai_training_logs', 'schema', 'public', 'record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_training_logs_webhook ON public.ai_training_logs;

CREATE TRIGGER ai_training_logs_webhook
  AFTER INSERT ON public.ai_training_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_distill_chat_fn();
