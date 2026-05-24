const fs = require('fs');

const frontendPath = '/Users/imran/Documents/Hostnin Frontend';
const talkfuzePath = '/Users/imran/Documents/Talkfuze';

const rawData = require(frontendPath + '/all_plans_dump.json');
const knowledgeJsonPath = talkfuzePath + '/src/actions/hostnin-knowledge.json';
const knowledge = require(knowledgeJsonPath);

// 1. Process standard plans
let formattedPlans = [];

// Helper to format a single plan
function formatPlan(p, type) {
    let serverSpecs = [];
    if (p.expandedFeatures && p.expandedFeatures.server) {
       serverSpecs = p.expandedFeatures.server.filter(f => f.included !== false).map(f => `${f.text} (${f.tooltip})`);
    } else if (p.server && Array.isArray(p.server)) {
       serverSpecs = p.server.map(f => typeof f === 'string' ? f : f.text);
    }
    
    let featureSpecs = [];
    if (p.features) {
       featureSpecs = p.features.filter(f => f.included !== false).map(f => {
         if (typeof f === 'string') return f;
         return f.tooltip ? `${f.text} - ${f.tooltip}` : f.text;
       });
    }

    if (p.expandedFeatures) {
       ['general', 'security', 'support'].forEach(category => {
         if (p.expandedFeatures[category]) {
            p.expandedFeatures[category].filter(f => f.included !== false).forEach(f => {
              featureSpecs.push(`${f.text}: ${f.tooltip}`);
            });
         }
       });
    }

    return {
      type: type || p.type,
      name: p.title || p.name,
      period: p.billingPeriod || p.period,
      price: p.price,
      monthlyBreakdown: p.monthlyBreakdown,
      currency: p.currency,
      features: featureSpecs,
      server: serverSpecs
    };
}

// Map the dumped plans
for (const [key, value] of Object.entries(rawData)) {
  if (key === 'otherPlans') {
     // These are the simple ones from pricing-data.ts (Node.js, WooCommerce, etc)
     // Actually, pricing-data.ts just holds basic references. Let's skip it since we didn't dump Nodejs properly.
     // Wait, the generic 'otherPlans' might have nested objects. Let's see.
  } else if (key === 'vps') {
     // vpsPlansByLocation mapping
     const bdix = value['bangladesh'] || [];
     const usa = value['usa-new-york'] || [];
     [...bdix, ...usa].forEach(vps => {
         // vps plan has quarterlyPrice, semiannuallyPrice etc. We need to split them into periods.
         // Wait, to keep it simple, we can just say "monthly" with the monthly price, since the user usually asks for monthly
         formattedPlans.push({
            type: "VPS Hosting",
            name: `${vps.title} (${vps.cpuCores} Cores, ${vps.ramAmount}GB RAM)`,
            period: "monthly",
            price: vps.monthlyPrice,
            monthlyBreakdown: vps.monthlyPrice,
            currency: "৳",
            features: [
              `Storage: ${vps.storageAmount}GB ${vps.storageType}`,
              `Bandwidth: ${vps.bandwidth}`,
              `Free Backup: ${vps.backupText}`
            ],
            server: [
               `${vps.cpuCores} Core CPU`,
               `${vps.ramAmount}GB RAM`,
               vps.cpuDetails,
               "Full Root Access",
               "1 IPv4 Address Included"
            ]
         });
     });
  } else if (Array.isArray(value)) {
     value.forEach(p => formattedPlans.push(formatPlan(p, p.type)));
  }
}

// 2. Hardcode Dedicated Servers from dedicated-hosting.tsx
const dedicatedData = [
  { name: "Starter Pro", cpu: "Intel Core i5-13500", ram: 64, storage: "2x 512 GB NVMe", cores: 14, price: 9900 },
  { name: "Business Elite", cpu: "Intel Core Ultra 7 265", ram: 64, storage: "2x 1 TB NVMe", cores: 20, price: 16650 },
  { name: "Enterprise RAM", cpu: "Intel Xeon Gold 5412U", ram: 256, storage: "2x 1.92 TB NVMe", cores: 24, price: 33525 },
  { name: "Value AMD", cpu: "AMD Ryzen 5 3600", ram: 64, storage: "2x 512 GB NVMe", cores: 6, price: 11999 },
  { name: "Pro AMD", cpu: "AMD Ryzen 7 PRO 8700GE", ram: 64, storage: "2x 512 GB NVMe", cores: 8, price: 11700 },
  { name: "Performance Max", cpu: "AMD Ryzen 9 7950X3D", ram: 128, storage: "2x 1.92 TB NVMe", cores: 16, price: 26100 },
  { name: "EPYC RAM", cpu: "AMD EPYC 9454P", ram: 256, storage: "2x 3.84 TB NVMe", cores: 48, price: 49725 },
  { name: "Storage Pro", cpu: "AMD Ryzen 7 3700X", ram: 64, storage: "88TB HDD + 2TB NVMe", cores: 8, price: 26100 }
];

dedicatedData.forEach(d => {
  formattedPlans.push({
    type: "Dedicated Server",
    name: d.name,
    period: "monthly",
    price: d.price,
    monthlyBreakdown: d.price,
    currency: "৳",
    features: [
      `CPU: ${d.cpu} (${d.cores} Cores)`,
      `RAM: ${d.ram} GB`,
      `Storage: ${d.storage}`
    ],
    server: [
      "1 Gbit/s Port",
      "In Built Firewall",
      "IPv4 & IPv6 Included",
      "Full Root/Administrator Access"
    ]
  });
});

// Since node.js hosting was missing from the dump, let's keep the old Node.js and WooCommerce plans from the existing JSON
const existingNodeJs = knowledge.plans.filter(p => p.type === 'Node.js Hosting' || p.type === 'WooCommerce Hosting' || p.type === 'N8n App Hosting');
formattedPlans = [...formattedPlans, ...existingNodeJs];

knowledge.plans = formattedPlans;

// 3. Update Policies
knowledge.policies.affiliate = "Earn generous commissions by promoting Hostnin. Web/BDIX/WordPress: 20-50%. Turbo/WooCommerce/Node.js: 10-40%. Cloud: 5-30%. Bonus: +10% if monthly sales exceed ৳50,000 ($500). EXCLUSIONS: Domains, Reseller Hosting, VPS, and Dedicated Servers are NOT eligible for commissions. Minimum Withdrawal: 5000 BDT or $50 USD. Maturation: 30 Days.";
knowledge.policies.refund = "30-day money-back guarantee for new hosting. Domains, SSLs, VPS, Dedicated Servers, software licenses, and SEO services are non-refundable.";
knowledge.policies.terms_summary = knowledge.policies.terms_summary + ", Affiliate Commissions exclude VPS/Dedicated/Domains.";

fs.writeFileSync(knowledgeJsonPath, JSON.stringify(knowledge, null, 2));
console.log("Compilation complete! Knowledge base has been enriched.");
