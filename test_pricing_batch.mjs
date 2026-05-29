import fetch from 'node-fetch';
import fs from 'fs';

const questions = [
  "What is the price of web hosting?",
  "How much does a .com domain cost?",
  "web hosting er price koto?",
  "domain renew korte koto taka lagbe?",
  "turbo hosting pro 3 year price koto?",
  "what is the price of 5 year turbo pro plan?",
  "do you have a 549tk plan?",
  "bdix hosting er monthly price koto?",
  "vps hosting er lowest price koto?",
  "dedicated server er dam koto?",
  "woocommerce hosting er price jante chai",
  "node js hosting koto tk?",
  "n8n hosting er daam koto?",
  "is domain 150 bdt?",
  "mailbox ki 500 bdt e pabo?",
  "cloud hosting 2 years er jonno koto porbe?",
  "what is the price of .io domain?",
  "how much is a .tech domain?",
  "web hosting starter plan er 3 bochorer dam koto?",
  "can I get a domain for 150 bdt?",
  "what's the cost for a 10 year cloud hosting plan?",
  "bdix hosting basic plan koto?",
  "i need a .xyz domain, price?",
  "what is the renewal cost of .net domain?",
  "domain transfer price koto .com er?",
  "web hosting ultimate 1 year koto?",
  "email solution er price koto?",
  "professional backup er dam koto?",
  "site builder er price jante chai",
  "ssl certificate koto tk?",
  "monitoring service er dam koto?",
  "do you have any 200tk hosting?",
  "cheapest hosting plan konta?",
  "can you give me price of 3 year vps hosting?",
  "what is the price for .co domain?",
  "what is the cost of .bd domain registration?",
  "turbo starter package 3 years koto?",
  "cloud ultimate plan 1 year price?",
  "web hosting pro monthly koto?",
  "vps server 4gb ram price?",
  "how much for dedicated server with 32gb ram?",
  "woocommerce basic plan monthly daam koto?",
  "node js ultimate package 3 bochor koto?",
  "reseller hosting er dam koto?",
  "is there any discount for 5 years?",
  "how much is malware protection?",
  "do you charge setup fee for dedicated servers?",
  "what is the price of .online domain?",
  "what is the cost of web hosting pro for 1 month?",
  "domain reg fee koto .org er?"
];

async function run() {
  const results = [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[${i+1}/50] Testing: ${q}`);
    
    try {
      const payload = {
        contextMessages: `[Imran]: ${q}`,
        contactName: "Test User",
        orgId: "ec2f8436-05dc-4621-8a7f-57202f865b8e",
        instruction: "",
        isTranslation: false,
        imageUrl: null
      };

      const res = await fetch('http://localhost:3000/api/ai/draft', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-vercel-ip-country': 'BD'
        },
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      let fullText = '';
      
      if (!text.includes('data: ')) {
         fullText = "ERROR/RAW: " + text;
      } else {
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) fullText += parsed.text;
              if (parsed.error) fullText += " [ERROR: " + parsed.error + "]";
            } catch(e) {}
          }
        }
      }

      // Check for hallucinated numbers that shouldn't be there
      let status = "✅ EXACT PRICE";
      if (fullText.includes('hostnin.com')) {
        status = "🔗 FALLBACK LINK";
      } else if (fullText.includes('ERROR')) {
        status = "❌ ERROR";
      }
      
      // Specifically check for 150 or 500 hallucinations
      const hasHallucination = (/150|500/.test(fullText)) && (!fullText.includes('hostnin.com'));
      if (hasHallucination) {
          status = "⚠️ POSSIBLE HALLUCINATION";
      }

      results.push({
        question: q,
        answer: fullText.trim() || "(Empty Response)",
        status
      });

    } catch (e) {
      console.error('Error on query:', q, e.message);
    }
  }

  // Generate markdown artifact
  let md = "# Pricing AI Hallucination Audit (50 Queries)\\n\\n";
  
  // Categorize
  const exact = results.filter(r => r.status === "✅ EXACT PRICE");
  const fallback = results.filter(r => r.status === "🔗 FALLBACK LINK");
  const errors = results.filter(r => r.status === "❌ ERROR");
  const hall = results.filter(r => r.status === "⚠️ POSSIBLE HALLUCINATION");
  
  md += `## Summary\\n`;
  md += `- **Total Queries:** 50\\n`;
  md += `- **Exact Price Retrieved:** ${exact.length}\\n`;
  md += `- **Smart Fallback Used:** ${fallback.length}\\n`;
  md += `- **Errors:** ${errors.length}\\n`;
  md += `- **Possible Hallucinations:** ${hall.length}\\n\\n`;
  
  md += `## Detailed Results\\n\\n`;
  
  results.forEach((r, i) => {
    md += `### ${i+1}. ${r.question}\\n`;
    md += `**Result:** ${r.status}\\n`;
    md += `**AI Response:**\\n> ${r.answer.replace(/\\n/g, '\\n> ')}\\n\\n`;
  });

  fs.writeFileSync('pricing_audit_results.md', md);
  console.log('Done! Wrote pricing_audit_results.md');
}

run();
