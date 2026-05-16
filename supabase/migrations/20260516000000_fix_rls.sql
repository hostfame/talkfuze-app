-- Enable realtime for channels
alter publication supabase_realtime add table public.channels;

-- Allow public reads on channels for the MVP phase
CREATE POLICY "Enable read access for all" ON public.channels FOR SELECT USING (true);
