-- Keep local schema aligned with the channel/settings types the app already uses.
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_type_check;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_type_check
  CHECK (
    type IN (
      'messenger',
      'widget',
      'instagram',
      'tiktok',
      'whatsapp',
      'settings_quick_replies',
      'settings_crm_webhook',
      'ai_openai',
      'ai_anthropic',
      'ai_gemini'
    )
  );

-- Older worker builds wrote inbound WhatsApp senders as "customer".
UPDATE public.messages
SET sender_type = 'contact'
WHERE sender_type = 'customer';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_type_check
  CHECK (sender_type IN ('contact', 'agent', 'ai', 'system'));

UPDATE public.messages
SET status = 'sent'
WHERE status IS NULL;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed'));

-- Prevent webhook retries from creating duplicate rows for the same platform message.
WITH duplicate_platform_messages AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY org_id, conversation_id, platform_message_id
      ORDER BY created_at, id
    ) AS duplicate_index
  FROM public.messages
  WHERE platform_message_id IS NOT NULL
)
UPDATE public.messages AS messages
SET platform_message_id = messages.platform_message_id || ':duplicate:' || duplicate_platform_messages.duplicate_index
FROM duplicate_platform_messages
WHERE messages.id = duplicate_platform_messages.id
  AND duplicate_platform_messages.duplicate_index > 1;

CREATE UNIQUE INDEX IF NOT EXISTS messages_org_conversation_platform_message_id_key
  ON public.messages (org_id, conversation_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;
