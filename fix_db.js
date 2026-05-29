require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

// Fix realtime ws error
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function fix() {
  const { data, error } = await supabase
    .from("call_logs")
    .update({ recording_url: null })
    .like("recording_url", "%/None");

  console.log("call_logs update:", data, error);

  const { data: data2, error: error2 } = await supabase
    .from("unpaid_invoice_calls")
    .update({ recording_url: null })
    .like("recording_url", "%/None");

  console.log("unpaid_invoice_calls update:", data2, error2);
}

fix();
