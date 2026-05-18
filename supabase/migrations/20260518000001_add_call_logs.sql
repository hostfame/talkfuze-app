-- Create call_logs table to store PBX call history
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    direction VARCHAR(50) NOT NULL,
    from_number VARCHAR(100),
    to_number VARCHAR(100),
    duration_seconds INTEGER DEFAULT 0,
    status VARCHAR(50),
    recording_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast retrieval by org_id
CREATE INDEX IF NOT EXISTS idx_call_logs_org_id ON call_logs(org_id);

-- Enable RLS
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see calls belonging to their organization
CREATE POLICY "Users can view org call_logs" 
ON call_logs FOR SELECT 
USING (
    org_id IN (
        SELECT org_id FROM users WHERE id = auth.uid()
    )
);

-- Policy: Users can insert call logs for their organization
CREATE POLICY "Users can insert org call_logs" 
ON call_logs FOR INSERT 
WITH CHECK (
    org_id IN (
        SELECT org_id FROM users WHERE id = auth.uid()
    )
);
