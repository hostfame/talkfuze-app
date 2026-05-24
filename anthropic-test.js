require('dotenv').config({ path: '.env.local' });

async function test() {
  const imageUrl = "https://media.talkfuze.com/worker-uploads/1779635802021-8801405657089_s.whatsapp.net/1779635802021_file.jpg";
  const imgRes = await fetch(imageUrl);
  const buffer = await imgRes.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString("base64");
  
  const userMessage = "The customer's latest message is: \"Amar website e error 500 dekhachhe.\"\nDraft a smart, helpful reply as the support agent.";

  console.log("Sending to Anthropic...");
  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Data }
            },
            { type: "text", text: userMessage }
          ]
        }
      ]
    })
  });

  console.log('Status:', anthropicResponse.status);
  const text = await anthropicResponse.text();
  console.log('Response body:', text);
}
test();
