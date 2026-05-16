const { createClient } = require('@supabase/supabase-js');
const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

// We can't execute DDL directly via the supabase-js client without a custom RPC.
// But we can just use curl to the Postgres API or run a query via the pg module.
