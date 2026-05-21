-- Safety net: Change conversations.channel_id FK from CASCADE to SET NULL
-- so that even if a channel row is accidentally deleted, conversations survive.
-- The channel_id column must be nullable for SET NULL to work.

-- Step 1: Make channel_id nullable
ALTER TABLE public.conversations ALTER COLUMN channel_id DROP NOT NULL;

-- Step 2: Drop the old CASCADE constraint
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_id_fkey;

-- Step 3: Re-add with SET NULL instead of CASCADE
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;
