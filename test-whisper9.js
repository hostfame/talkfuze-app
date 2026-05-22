require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });

async function run() {
  const mediaUrl = "https://media.talkfuze.com/worker-uploads/1779418296715-8801405657089_s.whatsapp.net/1779418296715.ogg";
  const audioRes = await fetch(mediaUrl);
  const arrayBuffer = await audioRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'audio/ogg' });
  formData.append("file", blob, "audio.ogg");
  formData.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const body = await whisperRes.json();
  console.log("Without prompt:", JSON.stringify(body));
}
run();
