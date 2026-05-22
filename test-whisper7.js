require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });
const OpenAI = require('openai');
const { toFile } = require('openai');

async function run() {
  const mediaUrl = "https://media.talkfuze.com/worker-uploads/1779417548294-8801405657089_s.whatsapp.net/1779417548294.ogg";
  const audioRes = await fetch(mediaUrl);
  const arrayBuffer = await audioRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/ogg' });
  formData.append("file", blob, "audio.ogg");
  formData.append("model", "whisper-1");
  formData.append("prompt", "এটি একটি কাস্টমার সাপোর্ট মেসেজ। কাস্টমার বাংলায় কথা বলছে।");
  formData.append("language", "bn");

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
