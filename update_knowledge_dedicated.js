const fs = require('fs');

const path = '/Users/imran/Documents/Talkfuze/src/actions/hostnin-knowledge.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const dedicatedPlans = [
  { name: "Starter Pro", price: 9900, setupFee: 11440, cpu: "Intel Core i5-13500 (14 Cores)", ram: 64, storage: "1 TB NVMe" },
  { name: "Business Elite", price: 16650, setupFee: 11440, cpu: "Intel Core Ultra 7 265 (20 Cores)", ram: 64, storage: "2 TB NVMe" },
  { name: "Enterprise RAM", price: 33525, setupFee: 23010, cpu: "Intel Xeon Gold 5412U (24 Cores)", ram: 256, storage: "3.84 TB NVMe" },
  { name: "Enterprise Storage", price: 33525, setupFee: 23010, cpu: "Intel Xeon Gold 5412U (24 Cores)", ram: 128, storage: "7.68 TB NVMe" },
  { name: "Value AMD", price: 11999, setupFee: 0, cpu: "AMD Ryzen 5 3600 (6 Cores)", ram: 64, storage: "1 TB NVMe" },
  { name: "Pro AMD", price: 11700, setupFee: 11440, cpu: "AMD Ryzen 7 PRO 8700GE (8 Cores)", ram: 64, storage: "1 TB NVMe" },
  { name: "Performance Max", price: 26100, setupFee: 11440, cpu: "AMD Ryzen 9 7950X3D (16 Cores)", ram: 128, storage: "3.84 TB NVMe" },
  { name: "EPYC RAM", price: 49725, setupFee: 23010, cpu: "AMD EPYC 9454P (48 Cores)", ram: 256, storage: "7.68 TB NVMe" },
  { name: "EPYC Storage", price: 49725, setupFee: 23010, cpu: "AMD EPYC 9454P (48 Cores)", ram: 128, storage: "7.68 TB NVMe" },
  { name: "Storage Pro", price: 26100, setupFee: 11440, cpu: "AMD Ryzen 7 3700X (8 Cores)", ram: 64, storage: "88 TB HDD + 2 TB NVMe" },
  { name: "Storage Elite", price: 51075, setupFee: 23010, cpu: "AMD Ryzen 9 3900 (12 Cores)", ram: 128, storage: "176 TB HDD + 3.84 TB NVMe" },
  { name: "Storage Ultimate", price: 96075, setupFee: 23010, cpu: "AMD EPYC 7502P (32 Cores)", ram: 256, storage: "308 TB HDD + 15.36 TB NVMe" }
];

const newPlans = dedicatedPlans.map(p => ({
  type: "Dedicated Server",
  name: p.name,
  period: "monthly",
  price: p.price,
  monthlyBreakdown: p.price,
  currency: "৳",
  setupFee: p.setupFee,
  features: [
    "Dedicated IP (IPv4 + IPv6)",
    "Full Root Access",
    "1 Gbit/s Port",
    "In Built Firewall",
    "Linux/Windows Options"
  ],
  server: [
    p.cpu,
    `${p.ram} GB RAM`,
    p.storage,
    `Setup Fee: ${p.setupFee > 0 ? '৳' + p.setupFee : 'Free Setup'}`
  ]
}));

// Filter out existing Dedicated Servers if present
data.plans = data.plans.filter(p => p.type !== "Dedicated Server");

data.plans = data.plans.concat(newPlans);

if (!data.policies.dedicated_info) {
  data.policies.dedicated_info = "Dedicated Servers offer maximum performance with fully dedicated hardware. Non-refundable. Most plans have a one-time setup fee (except Value AMD which has Free Setup). Available with Linux/Windows.";
}

fs.writeFileSync(path, JSON.stringify(data));
console.log("Updated hostnin-knowledge.json with dedicated plans");
