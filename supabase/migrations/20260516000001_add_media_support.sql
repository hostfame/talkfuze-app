-- Add missing columns to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Add missing columns to messages for media and internal notes
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB
  '{image/jpeg,image/png,image/gif,image/webp,video/mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Set up RLS for the bucket
-- Allow public read access to chat media
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'media');

-- Allow authenticated users (agents) to upload media
CREATE POLICY "Agent Upload Access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');
