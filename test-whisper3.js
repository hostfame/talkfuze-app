require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });
async function run() {
  const mediaUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co/storage/v1/object/public/messages/f47ac10b-58cc-4372-a567-0e02b2c3d479/f8c05ef1-18e9-4e78-bad6-edfb602497fb/media/449339352-870636254580220-4100570691717354316-m_1716327855018.ogg";
  const audioRes = await fetch(mediaUrl);
  const arrayBuffer = await audioRes.arrayBuffer();
  
  const formData = new FormData();
  const file = new File([arrayBuffer], "audio.ogg", { type: 'audio/ogg' });
  formData.append("file", file);
  formData.append("model", "whisper-1");
  formData.append("prompt", "এটি একটি কাস্টমার সাপোর্ট মেসেজ। কাস্টমার বাংলায় কথা বলছে।");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  console.log("Status:", whisperRes.status);
  console.log("Body:", await whisperRes.text());
}
run();
