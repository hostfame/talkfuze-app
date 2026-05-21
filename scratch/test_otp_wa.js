const apiToken = "e58d7b1f868172449d6cf77214207cf8f2d5ea737df431f4696d4402194b27b3";
const apiUrl = "https://app.talkfuze.com/api/v1/whatsapp/send";

async function testSend() {
  const payload = {
    to: "8801770096411", // Test number format
    message: "*Verify your Hostnin login*\n\nHello Test,\n\nYour one-time login code is: *999999*\n\nThis code expires in 5 minutes."
  };

  console.log('Sending payload to:', apiUrl);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify(payload)
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testSend();
