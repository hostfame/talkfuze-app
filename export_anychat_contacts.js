const fs = require('fs');
const https = require('https');

const API_KEY = 'QBdDGzCoPIefF3bojIqkbYnJsJ5dPcJT1z0U9xgLBQcJhxtwBEchYGW6FvR-jsOU';

function fetchPage(page) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.anychat.one',
            path: `/public/v1/contact?limit=100&page=${page}`,
            method: 'GET',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${data}`));
                    }
                } else {
                    reject(new Error(`API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function fetchAllContacts() {
    let allContacts = [];
    let page = 1;
    let totalPages = 1;

    console.log("Starting to fetch contacts from AnyChat...");

    try {
        while (page <= totalPages) {
            console.log(`Fetching page ${page} of ${totalPages}...`);
            const response = await fetchPage(page);
            
            if (response && response.data) {
                allContacts = allContacts.concat(response.data);
                totalPages = response.pages; // Update total pages based on response
                console.log(`Fetched ${response.data.length} contacts. Total so far: ${allContacts.length}`);
            } else {
                console.warn("Unexpected response format:", response);
                break;
            }
            page++;
            
            // Add a small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        fs.writeFileSync('anychat_contacts_export.json', JSON.stringify(allContacts, null, 2));
        console.log(`\nSuccess! Exported ${allContacts.length} contacts to anychat_contacts_export.json`);
    } catch (error) {
        console.error("\nError fetching contacts:", error.message);
    }
}

fetchAllContacts();
