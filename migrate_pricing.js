const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const frontendPath = '/Users/imran/Documents/Hostnin Frontend';
const talkfuzePath = '/Users/imran/Documents/Talkfuze';

// We will use a small script in the frontend directory to dump all plans to a JSON file.
const dumpScript = `
import { enhancedWebHostingData } from './src/data/enhanced-web-pricing.ts';
import { enhancedTurboHostingData } from './src/data/enhanced-turbo-pricing.ts';
import { enhancedBdixHostingData } from './src/data/enhanced-bdix-pricing.ts';
import { enhancedCloudHostingData } from './src/data/enhanced-cloud-pricing.ts';
import { enhancedNodejsHostingData } from './src/data/enhanced-nodejs-pricing.ts';
import { enhancedWordpressHostingData } from './src/data/enhanced-wordpress-pricing.ts';
import { enhancedWoocommerceHostingData } from './src/data/enhanced-woocommerce-pricing.ts';
import { vpsThreeYearPlans, vpsOneYearPlans, vpsMonthlyPlans } from './src/data/enhanced-vps-pricing.ts';
import { enhancedDedicatedHostingData } from './src/data/enhanced-dedicated-pricing.ts';

const allPlans = [
  ...enhancedWebHostingData.map(p => ({ ...p, type: 'Web Hosting' })),
  ...enhancedTurboHostingData.map(p => ({ ...p, type: 'Turbo NVMe Hosting' })),
  ...enhancedBdixHostingData.map(p => ({ ...p, type: 'BDIX Hosting' })),
  ...enhancedCloudHostingData.map(p => ({ ...p, type: 'Cloud Hosting' })),
  ...enhancedNodejsHostingData.map(p => ({ ...p, type: 'Node.js Hosting' })),
  ...enhancedWordpressHostingData.map(p => ({ ...p, type: 'WordPress Hosting' })),
  ...enhancedWoocommerceHostingData.map(p => ({ ...p, type: 'WooCommerce Hosting' })),
  ...[...vpsThreeYearPlans, ...vpsOneYearPlans, ...vpsMonthlyPlans].map(p => ({ ...p, type: 'VPS Hosting' })),
  ...enhancedDedicatedHostingData.map(p => ({ ...p, type: 'Dedicated Server' }))
];

require('fs').writeFileSync('./all_plans_dump.json', JSON.stringify(allPlans, null, 2));
`;

fs.writeFileSync(path.join(frontendPath, 'dump_plans.ts'), dumpScript);

try {
  console.log("Executing dump script in Frontend workspace...");
  execSync('npx tsx dump_plans.ts', { cwd: frontendPath });
  console.log("Dump successful.");
  
  const rawData = require(path.join(frontendPath, 'all_plans_dump.json'));
  
  // Format for Talkfuze JSON
  const formattedPlans = rawData.map(p => {
    // Flatten features and server into rich strings: "Feature Name: Tooltip explanation"
    // This allows AI to have all context without changing knowledge-engine.ts parsing logic drastically
    // Actually, knowledge-engine.ts just joins by comma. Let's make it a clean string list.
    
    let serverSpecs = [];
    if (p.expandedFeatures && p.expandedFeatures.server) {
       serverSpecs = p.expandedFeatures.server.filter(f => f.included !== false).map(f => `${f.text} (${f.tooltip})`);
    } else if (p.server && Array.isArray(p.server) && typeof p.server[0] === 'string') {
       serverSpecs = p.server;
    } else if (p.server && Array.isArray(p.server)) {
       serverSpecs = p.server.map(f => f.text);
    }
    
    let featureSpecs = [];
    if (p.features) {
       featureSpecs = p.features.filter(f => f.included !== false).map(f => {
         if (typeof f === 'string') return f;
         return `${f.text} - ${f.tooltip}`;
       });
    }

    // Add extra expanded features categories if they exist (general, security, support)
    if (p.expandedFeatures) {
       ['general', 'security', 'support'].forEach(category => {
         if (p.expandedFeatures[category]) {
            const included = p.expandedFeatures[category].filter(f => f.included !== false);
            included.forEach(f => {
              featureSpecs.push(`${f.text}: ${f.tooltip}`);
            });
         }
       });
    }

    return {
      type: p.type,
      name: p.title || p.name,
      period: p.billingPeriod || p.period,
      price: p.price,
      monthlyBreakdown: p.monthlyBreakdown,
      currency: p.currency,
      features: featureSpecs,
      server: serverSpecs
    };
  });
  
  const talkfuzeJsonPath = path.join(talkfuzePath, 'src/actions/hostnin-knowledge.json');
  const existingJson = require(talkfuzeJsonPath);
  
  existingJson.plans = formattedPlans;
  
  fs.writeFileSync(talkfuzeJsonPath, JSON.stringify(existingJson, null, 2));
  console.log("Successfully updated Talkfuze knowledge base with all plans and rich tooltips!");
  
} catch(e) {
  console.error("Error:", e.message);
}
