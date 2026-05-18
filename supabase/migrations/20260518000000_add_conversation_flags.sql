ALTER TABLE public.conversations 
ADD COLUMN is_pinned BOOLEAN DEFAULT false,
ADD COLUMN is_unread BOOLEAN DEFAULT false,
ADD COLUMN is_muted BOOLEAN DEFAULT false;
