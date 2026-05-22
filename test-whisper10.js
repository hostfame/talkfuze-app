require('dotenv').config({ path: '/Users/imran/Documents/Talkfuze/.env.local' });
const OpenAI = require('openai');
const fs = require('fs');

async function run() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const mediaUrl = "https://media.talkfuze.com/worker-uploads/1779418296715-8801405657089_s.whatsapp.net/1779418296715.ogg";
  const audioRes = await fetch(mediaUrl);
  const arrayBuffer = await audioRes.arrayBuffer();
  fs.writeFileSync('test.ogg', Buffer.from(arrayBuffer));

  const transcription1 = await openai.audio.transcriptions.create({
    file: fs.createReadStream('test.ogg'),
    model: "whisper-1"
  });
  console.log("Without prompt:", transcription1.text);

  const transcription2 = await openai.audio.transcriptions.create({
    file: fs.createReadStream('test.ogg'),
    model: "whisper-1",
    prompt: "হ্যালো, ডোমেইন, হোস্টিং, ওয়েবসাইট, পেমেন্ট, সমস্যা, বিকাশ, টাকা, সাপোর্ট, হোষ্টনিন, Hostnin, Cpanel"
  });
  console.log("With prompt:", transcription2.text);
}
run();
