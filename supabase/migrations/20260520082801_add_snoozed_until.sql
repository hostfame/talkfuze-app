-- Add snoozed_until column to conversations table
ALTER TABLE conversations ADD COLUMN snoozed_until timestamptz NULL;
