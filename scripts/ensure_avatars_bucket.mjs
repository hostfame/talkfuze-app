import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

async function ensureBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    console.error("Error listing buckets:", error);
    return;
  }
  
  const avatarsBucket = buckets.find(b => b.name === 'avatars');
  if (!avatarsBucket) {
    const { data, error: createError } = await supabaseAdmin.storage.createBucket('avatars', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'],
      fileSizeLimit: 5242880 // 5MB
    });
    if (createError) {
      console.error("Error creating avatars bucket:", createError);
    } else {
      console.log("✅ Avatars bucket created successfully!");
    }
  } else {
    console.log("✅ Avatars bucket already exists!");
  }
}
ensureBucket();
