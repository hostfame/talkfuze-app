const fs = require('fs');

const path = '/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const vpsPlans = [
  // Bangladesh
  { name: "Starter (Bangladesh)", price: 1599, cpu: 1, ram: 2, disk: 25, bw: "500 GB" },
  { name: "Plus (Bangladesh)", price: 3199, cpu: 2, ram: 4, disk: 50, bw: "1 TB" },
  { name: "Pro (Bangladesh)", price: 5699, cpu: 4, ram: 8, disk: 100, bw: "2 TB" },
  { name: "Ultimate (Bangladesh)", price: 10999, cpu: 8, ram: 16, disk: 200, bw: "4 TB" },
  { name: "Enterprise (Bangladesh)", price: 21999, cpu: 16, ram: 32, disk: 400, bw: "8 TB" },
  // Singapore
  { name: "Starter (Singapore)", price: 2759, cpu: 2, ram: 4, disk: 80, bw: "2 TB" },
  { name: "Plus (Singapore)", price: 5639, cpu: 4, ram: 8, disk: 160, bw: "4 TB" },
  { name: "Pro (Singapore)", price: 9599, cpu: 8, ram: 16, disk: 320, bw: "8 TB" },
  { name: "Ultimate (Singapore)", price: 13799, cpu: 12, ram: 24, disk: 480, bw: "12 TB" },
  { name: "Enterprise (Singapore)", price: 17999, cpu: 16, ram: 32, disk: 640, bw: "16 TB" },
  // Germany/Finland
  { name: "Starter (Germany/Finland)", price: 1559, cpu: 2, ram: 4, disk: 80, bw: "20 TB" },
  { name: "Plus (Germany/Finland)", price: 2639, cpu: 4, ram: 8, disk: 160, bw: "20 TB" },
  { name: "Pro (Germany/Finland)", price: 4799, cpu: 8, ram: 16, disk: 320, bw: "20 TB" },
  { name: "Ultimate (Germany/Finland)", price: 7199, cpu: 12, ram: 24, disk: 480, bw: "20 TB" },
  { name: "Enterprise (Germany/Finland)", price: 10799, cpu: 16, ram: 32, disk: 640, bw: "20 TB" },
  // USA
  { name: "Starter (USA)", price: 1679, cpu: 2, ram: 4, disk: 80, bw: "20 TB" },
  { name: "Plus (USA)", price: 2999, cpu: 4, ram: 8, disk: 160, bw: "20 TB" },
  { name: "Pro (USA)", price: 5399, cpu: 8, ram: 16, disk: 320, bw: "20 TB" },
  { name: "Ultimate (USA)", price: 8399, cpu: 12, ram: 24, disk: 480, bw: "20 TB" },
  { name: "Enterprise (USA)", price: 11999, cpu: 16, ram: 32, disk: 640, bw: "20 TB" }
];

const newPlans = vpsPlans.map(p => ({
  type: "VPS Hosting",
  name: p.name,
  period: "monthly",
  price: p.price,
  monthlyBreakdown: p.price,
  currency: "৳",
  features: [
    "Dedicated IP (IPv4 + IPv6)",
    "Full Root Access",
    "1 Tbps+ DDoS Protection",
    "AMD EPYC™ Processor",
    "ECC RAM",
    "NVMe SSD Storage",
    "24/7/365 Support",
    "Cloud Firewall",
    "Instant Provisioning"
  ],
  server: [
    `${p.cpu} vCPU Core${p.cpu > 1 ? 's' : ''}`,
    `${p.ram} GB RAM`,
    `${p.disk} GB NVMe Storage`,
    `${p.bw} Bandwidth`
  ]
}));

// Filter out existing VPS Hosting if present to avoid duplication
data.plans = data.plans.filter(p => p.type !== "VPS Hosting");

data.plans = data.plans.concat(newPlans);

// Add dedicated server note in policies
if (!data.policies.vps_info) {
  data.policies.vps_info = "VPS Hosting is self-managed by default but full root access is provided. They are available in multiple locations: Bangladesh (BDIX), Singapore, Germany, Finland, and USA. Non-refundable.";
}

fs.writeFileSync(path, JSON.stringify(data));
console.log("Updated hostnin-knowledge.json");
