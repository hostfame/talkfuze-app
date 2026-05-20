-- Add columns to support browser WebRTC call logging
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_type VARCHAR(50) DEFAULT 'pbx';
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS conversation_id TEXT;
