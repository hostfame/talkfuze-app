const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const frontendPath = '/Users/imran/Documents/Hostnin Frontend';

const dumpScript = `
import { enhancedWebHostingData } from './src/data/enhanced-web-pricing.ts';
import { enhancedTurboHostingData } from './src/data/enhanced-turbo-pricing.ts';
import { enhancedBdixHostingData } from './src/data/enhanced-bdix-pricing.ts';
import { enhancedCloudHostingData } from './src/data/enhanced-cloud-pricing.ts';
import { enhancedWordpressHostingData } from './src/data/enhanced-wordpress-pricing.ts';
import { hostingPlansData } from './src/data/pricing-data.ts';
import { vpsPlansByLocation } from './src/data/vps-plans.ts';

// Dedicated is in a tsx component, maybe hard to import easily if it has JSX
// Let's dump what we can first
const allPlans = {
  web: enhancedWebHostingData,
  turbo: enhancedTurboHostingData,
  bdix: enhancedBdixHostingData,
  cloud: enhancedCloudHostingData,
  wordpress: enhancedWordpressHostingData,
  otherPlans: hostingPlansData,
  vps: vpsPlansByLocation
};

require('fs').writeFileSync('./all_plans_dump.json', JSON.stringify(allPlans, null, 2));
`;

fs.writeFileSync(path.join(frontendPath, 'dump_plans.ts'), dumpScript);

try {
  execSync('npx tsx dump_plans.ts', { cwd: frontendPath });
  console.log("Dump successful!");
} catch(e) {
  console.log("Error:", e.message);
}
