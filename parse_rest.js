const fs = require('fs');
const { execSync } = require('child_process');

const frontendPath = '/Users/imran/Documents/Hostnin Frontend';

const script = `
import { vpsPlansByLocation } from './src/data/vps-plans.ts';

const bdixVps = vpsPlansByLocation['bangladesh'];
const usaVps = vpsPlansByLocation['usa-new-york'];

const all = [
  ...bdixVps.map(p => ({ ...p, type: 'VPS Hosting', location: 'Bangladesh' })),
  ...usaVps.map(p => ({ ...p, type: 'VPS Hosting', location: 'USA' }))
];

require('fs').writeFileSync('./vps_dump.json', JSON.stringify(all, null, 2));
`;

fs.writeFileSync(frontendPath + '/dump_vps.ts', script);
execSync('npx tsx dump_vps.ts', { cwd: frontendPath });
console.log("Dumped VPS");
