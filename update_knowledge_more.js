const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/actions/hostnin-knowledge.json');
const knowledge = JSON.parse(fs.readFileSync(p, 'utf8'));

knowledge.plans.forEach(plan => {
  let ssh = "No SSH/Terminal Access";
  let nproc = "";

  const name = plan.name;
  const type = plan.type;

  if (type === "Turbo NVMe Hosting" || type === "Node.js Hosting") {
      ssh = "SSH Access Included";
  } else {
      if (name === "Pro" || name === "Ultimate" || name === "WP Ultimate") {
          ssh = "SSH/Terminal Access Included";
      }
  }

  if (name === "Basic" || name === "WP Starter") nproc = "50 Max Processes";
  else if (name === "Starter" || name === "WP Pro") nproc = "100 Max Processes";
  else if (name === "Pro" || name === "WP Ultimate") nproc = "150 Max Processes";
  else if (name === "Ultimate") nproc = "200 Max Processes";

  if (!plan.server) plan.server = [];
  
  // Remove old
  plan.server = plan.server.filter(s => !s.toLowerCase().includes('ssh') && !s.toLowerCase().includes('max process') && !s.toLowerCase().includes('terminal'));

  // For Turbo, we might not need NPROC since it's not defined in the frontend, but we can add it to be safe. 
  // Let's only add NPROC if it's not Turbo, OR if it's Turbo we can skip it, but let's just add it so AI knows.
  // Actually, wait, Turbo might have higher NPROC. Let's just omit nproc for Turbo to be consistent with frontend.
  if (type !== "Turbo NVMe Hosting" && nproc) {
      plan.server.push(nproc);
  }
  plan.server.push(ssh);
});

fs.writeFileSync(p, JSON.stringify(knowledge, null, 2));
console.log('Updated SSH and NPROC successfully.');
