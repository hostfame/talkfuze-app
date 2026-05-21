const URL = "https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A";
const HEADERS = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function run() {
  console.log("Fetching all contacts...");
  const res = await fetch(`${URL}/contacts?select=*`, { headers: HEADERS });
  const contacts = await res.json();
  console.log(`Fetched ${contacts.length} contacts.`);

  const corrupted = contacts.filter(c => 
    (c.phone && c.phone.includes('@')) || 
    (c.platform_id && c.platform_id.includes('@') && !c.platform_id.endsWith('@s.whatsapp.net') && !c.platform_id.endsWith('@g.us') && !c.platform_id.endsWith('@lid') && c.platform_type === 'whatsapp') ||
    (c.platform_id && c.platform_id.includes('@gmail.com'))
  );

  console.log(`Found ${corrupted.length} corrupted contacts:`);
  console.log(JSON.stringify(corrupted, null, 2));

  for (const c of corrupted) {
    console.log(`\nFixing contact: ${c.name} (${c.id})`);
    
    // Extract correct LID/phone
    let correctPlatformId = null;
    let correctPhone = null;
    let correctEmail = null;

    if (c.phone && c.phone.includes('@')) {
      correctEmail = c.phone;
    }

    if (c.metadata?.lid) {
      correctPlatformId = `${c.metadata.lid}@s.whatsapp.net`;
      // Let's also check if there is a resolved real phone
      if (c.metadata.real_phone && !c.metadata.real_phone.includes('@')) {
        correctPhone = c.metadata.real_phone;
      }
    } else {
      // If we don't have LID, but platform_id was corrupted
      // Try to recover from metadata or keep null
      if (c.metadata?.real_phone && !c.metadata.real_phone.includes('@')) {
        correctPhone = c.metadata.real_phone;
        correctPlatformId = `${correctPhone}@s.whatsapp.net`;
      }
    }

    const updates = {
      phone: correctPhone,
      email: correctEmail || c.email
    };

    if (correctPlatformId) {
      updates.platform_id = correctPlatformId;
    }

    // Clean up metadata
    const newMetadata = { ...(c.metadata || {}) };
    if (newMetadata.real_phone && newMetadata.real_phone.includes('@')) {
      delete newMetadata.real_phone;
    }
    delete newMetadata.whatsapp_invalid; // clear invalid flag
    updates.metadata = newMetadata;

    console.log("Applying updates:", JSON.stringify(updates, null, 2));

    const updateRes = await fetch(`${URL}/contacts?id=eq.${c.id}`, {
      method: "PATCH",
      headers: {
        ...HEADERS,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(updates)
    });

    if (updateRes.ok) {
      console.log(`Successfully fixed contact: ${c.name}`);
    } else {
      console.error(`Failed to fix contact: ${c.name}. Status: ${updateRes.status}`);
      console.error(await updateRes.text());
    }
  }
}

run();
