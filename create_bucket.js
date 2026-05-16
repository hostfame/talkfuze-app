require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Checking if 'media' bucket exists...");
  const { data: buckets, error } = await supabase.storage.listBuckets();
  
  if (error) {
    console.error("Error listing buckets:", error);
    return;
  }
  
  const exists = buckets.some(b => b.name === 'media');
  if (exists) {
    console.log("Bucket 'media' already exists.");
    
    // Update it to be public just in case
    await supabase.storage.updateBucket('media', {
      public: true,
      fileSizeLimit: 52428800 // 50MB
    });
    console.log("Bucket set to public.");
    return;
  }
  
  console.log("Creating 'media' bucket...");
  const { data, error: createError } = await supabase.storage.createBucket('media', {
    public: true,
    fileSizeLimit: 52428800 // 50MB
  });
  
  if (createError) {
    console.error("Failed to create bucket:", createError);
  } else {
    console.log("Successfully created bucket 'media'");
  }
}

main();
