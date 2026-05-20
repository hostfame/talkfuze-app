-- Add tags array column to conversations table
ALTER TABLE conversations ADD COLUMN tags text[] DEFAULT '{}'::text[];
