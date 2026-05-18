const { createClient } = require('@supabase/supabase-js');

async function run() {
  const url = 'https://fyuymnldgvfvdqcnbsxh.supabase.co/rest/v1';
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dXltbmxkZ3ZmdmRxY25ic3hoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNzUwNiwiZXhwIjoyMDk0MzkzNTA2fQ.fkZvxGkgW3yktVkLUxmOaEEdVRTymtrFK4uOj9Wa66A';
  const headers = {
    'apikey': apikey,
    'Authorization': `Bearer ${apikey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // The new valid tokens fetched using the User Token Imran provided
  const newTokens = {
    "100798762190992": "EAAXz3IbQJssBRQScSeHDvCeKTLJ8eyLQhUwtgM6WIQzQBR1unsCab7Nnzku7z7Gky2EyIO3dZCAnwNi7ZB8tqBabWBSjSvZC3hQkDZBTrKNTSETBcl1HfgxSbiTUAJBwjMGPyQnY1RgZAmDvIVMVKaxmNwYAaJ4NQhORHPTsDEZCx8JX72IsuLlbZArjodnx7xrcVl62aYgo207L9JgYU47ZBxli1mQzuJ29QndJZCZBa0rgZDZD", // Poko Host
    "105440041873044": "EAAXz3IbQJssBRb7D2E20XMkbhGqZCLW4lVZBYOEbIZB2sGYPhLT6G0Bj9msKsxTrlc75npeMlPQuH3iKtrpNWxfwfBbABAUlzmMPS5SKAI1xkgrC7Rhu4d8LjrNHuDF3bFDmlGFgefDInyk3CML7q6Gr0ZAfNOUpfdHMuzL5QQZBgO4nrexXRiTOsPHb5GF819SYwFO11i42Kp2KhGuPgc9QuPoRKjOoMLvrrlPOgsgZDZD", // Poko Host Offers
    "102678148765035": "EAAXz3IbQJssBReBWR4sFr5VVGvzlunG6MZCaIZB17HzZAAJ6IYZAEo8OGGX5ZCbZCkZBjakFvnZAHYTQZCzdJgLkZC1DSlxxXtN8S89ZAD4LHwpb8xFqRO0A5Xme1jRO4i6otSEfyp6V2ZB5jJYNq6qDuHTVX3BzYNChj9I95ijUWzN6BFbyIsmpC9LlyfNXMDrvwtmfdZCZBIPtoSZBaP7054yyvlVXR4Jd4tmcJIZAwy0TQqlzBQZDZD", // PokoHost Deal
    "106774155012915": "EAAXz3IbQJssBRX9EFnXTzsruagHekynVe80urlrNgLVN3UsVPoKAqSpVtiyaG0P5a7L9o1DjL2Imw9FbUZCGiivldE7QbrCAZBGEVN8mDSShZCPYFfCNpeWUXP2ZCsTCwEPZBS1XUlxecJPWcALJ3mLi5hv5H54uGFu1p0ygFRg8ZCoE9uCyxJ33aTd8yUTQI9pZCeTffoGlJfqPoAGo2yAdM3X5Xw13uipvyHxX0AslQZDZD", // PokoHost Services
    "100167318999363": "EAAXz3IbQJssBRR6EQ5Qspf2bVBJPolcOjTZBDJZBMoDmwWuHZCJ5QdYlapj4MPjgDWzgo29unwPdgPFMGg86GmAkuC1ZAfk734Dzc72hYj2dpxl0gTpxxyP4oHEZBIQ88LO9H3pRTuOQjiRF0ogVLRbnIwOXJzFUMmPFtjCleJtLrbgBRIbhF5je8WHUbc9xxPZCdaIAgzuQqbdmt7OsNjJZCRbJhZCVNimOcsqwBdVUiQZDZD", // PokoHost.com
    "101706842161240": "EAAXz3IbQJssBRTGpCMMHvs8ifVHlRgSI1mbTp3o0nazysZAwlvY34BEGBoNlhFbBYOZAKZAr7hzF53klWl4apwnZBtS1XYPRonwGZBaL7qdAqTBn0dQWkJhhcr1VmlZA53jXAK88Kft0rYwkLq8vdDPxQozHno9AJmojRNw7FzhTZCf8BR9OzNAlER4ZCcll69Dq2tUTQe4Oefd4cLsqS9G7mS6yU0NueTkogGWhonyRaQZDZD", // PokoHost Support
    "103455265288196": "EAAXz3IbQJssBRXfMEyZBMuvxHwAlPY0gkiYkMV4lSwTcf7hNZB0R3guZAVcG30ynFZCZCi4FXc89y6iZCsn7dP4wvqDWVmCVoNVlAefxRO2CrukjIX58QNSaw3EVR26oRKfZB8A9TfbJbIJbVSosaDij6Vqf8sFVO9ZBTKZBgQACzcCctU85x1s6cLEUHzYFb3OnYzGCLid9LtisfuHO37GjUOAIqdYtfO5PuiTlR5r5FbAZDZD", // PokoHost Offers
    "107402741186197": "EAAXz3IbQJssBRb146M3p5jVhIu7tnKMZBJGIySdHrxu4ZCdOcYnjzkZAGVxbTEgaHBjhL2KI7lmvMxZBysEPdvWuTO3UL6LzA6MBOYIAbm9p4Xkrkst7EpiKhs17d9tZCzI21uBcOI5mwWxYL0CSqO23zuHMcIuWDaxiUcCkl8iZCLhEqO2cTnhktRnVA1muQ5GNM4L5NQDwcgU8aBRUEipf6JyLiN8QH6ojvvP7mdXwZDZD", // Suba Host
    "109392410812974": "EAAXz3IbQJssBRaF10343xp3F9mOfvPq8NOyjZCSlYJtDqOHOZBtcQRZC2ArXl9UOTzMa99sEqnPgBWkvLOcXKoW3GkjZBYnI2RrVmmyNtaXvcmcaNwpE0fu3f4OsjB8o0yxU1f0wpE3NEQ439boOU08kPFEY1jIStFNJ0NximXRmyoK6a5e9Yq3ZArdkYEonC9M6sfEAaqIOeMdTGI0pwkgD293SKrr2jYxULeQD3ZAwZDZD", // Electronics World
    "101979898557418": "EAAXz3IbQJssBRYqrkWn7Bg0YyH5D0V7hAavN4Q0Q5xMZBz8NeyjULX8nXMJIM0SkHGNXP8LeQGLcck1r4MHVXMBUR9wpJFWaCpdWrpPymEQ7Lm6esBxjpAw1TedWEkTttDdlaOqr6ZBlmoMEUE5lWRz7K5QVPuDG4zjXjnlegPKEK7QwqZAnn9PPHTBNIIXlROZC597eFIfPbcy3FKeT5R99o6MQjEDG5bnoJhrZAAQZDZD", // Descentus Clothing
    "101429685105529": "EAAXz3IbQJssBRezMmwTqfh8UqZBFFm1NPrmRqyshx2PwPudToOhCqEJCqEIxqZCYzDSCnuyG4TZATOM5tnTYBbtSxZBSc2OO83ZBOe6PsnraiaYh55HZCUWXQZA0e8ECdiFrt7rZCCXsraoDxuKCJ08MPf7HMpXsxsUKBzpvp87ZCpQYpYoaakuOa2Y3RGbv05NDRZAJH8Tf7I5X0T0XJWFIY1cU4XRo0V6EfiLgOCBBhduAZDZD", // Computer Touch Bhola
    "105411171098231": "EAAXz3IbQJssBRWWfop52xWErNekOlgxD4azPu4zaVaZBVYsaAlLf8ZCDHsVFG0P4yTV8VJijkjjM0whgueuQZA6ZAzmVpRrbKfooUKgGDKKkkZCPGrynK2XRRWGG7qndXTZA60ZAfwZBoYzTpiknBb7TnMovlUu8VInfw6gwFGIdFkIVQzjp3d5LlAYdgqGqAHOcHv5IlXqZAzcUrXaiOchQecBTAClTWu7PMPE1jyCFHxQZDZD", // কুমিল্লা হিজামা ক্লিনিক
    "103635754632557": "EAAXz3IbQJssBRYZC4rG2Cp7uwQDtZBiSmKZBYSFRoUVzZBMJ9GYuoYcp4D2NAjWbtpSnwxNSEX6bZAIlqJyEMZAj6YrRXOAeQJLTYqnbvZAZAaTLtneMl2DuGi5hpxpTAWCZA7npko7RZBGTKrRImb7hKOZB4BPmaBdU1Kdw7zqn7XLZAIu4jQ0sZArB1rZANlqxSwqpXqqeAK9YnIW5tYulz41v0Ixjpj4J3pByKqy90E8AZDZD", // Creative Agency
    "108691501016398": "EAAXz3IbQJssBRVwRitNBkIxHSz5nECQy5tYGJ9DLBHukOV3OctnhZBzOJZAX2enXI0EaP2B6Asm3ShXYFijrzrXmbRPXqw4xOK9taEdhLeiVF2BQg5FODRwgvB8opRVmE7hpkvNaH63a3bA3NMFDIlIDVacwR1e6ZA6ZCqhJH8xO5BdANqA5HAIutShYh4KXEfgRSby43IhLehRCMP3xaTTDYXQZCA3mwJ6tJZAgZDZD", // Digital Kenakata-2
    "107555781103048": "EAAXz3IbQJssBRXB4cwBTM5ZBIzYSrI8XwiEZAfjYpCbM8xcTdntv1BRpazdQ4BVgRG9vdzwZAZCa0u6PtxfRuvnZCxL2ZCmzhdZCa2arobkr6leLX5UVRoEplwvZA7hunBfbJZB2hKmVFq5JKIFJEnP6xIRZC53fcpNylzLbOY8D9EAQeWEgNFelo2aUaekfJSjP06ocBmDv2pz5ZC4mV5MuvThKO2Ele9IdjuPjh61gQZDZD", // Descentus
    "114268424599917": "EAAXz3IbQJssBRc01wI35ZBSkZA6u2lZACoIfZBc42bF8T1ZBZCTm7Rz9D78864vK14YkL6rA3aK5i54XgGZCX8f9d0cW62KAZBSa8D93o59aH1qZABkIuI5oDIm4fXb1jZAZACl5g0z1K905v0s2lA2oD3rCofZBxBwQ3B8wRof4oJmIf9jA2zK2y97XkZATtG6f98jV1ZAM5I2ZBCW1H8XyQZDZD" // কৃষিপণ্য বিক্রয়
  };

  // Get all channels
  const res = await fetch(`${url}/channels`, { headers });
  const channels = await res.json();
  let updatedCount = 0;

  for (const channel of channels) {
    if (channel.type === 'messenger' || channel.type === 'instagram') {
      const pageId = channel.type === 'instagram' ? channel.config.facebook_page_id : channel.config.page_id;
      if (pageId && newTokens[pageId]) {
        channel.config.access_token = newTokens[pageId];
        
        const patchRes = await fetch(`${url}/channels?id=eq.${channel.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ config: channel.config })
        });
        
        if (patchRes.ok) {
          updatedCount++;
          console.log(`Updated token for: ${channel.config.page_name}`);
        }
      }
    }
  }
  console.log(`Successfully updated ${updatedCount} channels.`);
}

run();
