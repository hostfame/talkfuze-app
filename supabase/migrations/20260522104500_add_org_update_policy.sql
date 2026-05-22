-- Add UPDATE policy for organizations to allow users to update their own organization settings
CREATE POLICY "Users can update their own organization"
    ON public.organizations FOR UPDATE
    USING (id = public.current_org_id());
