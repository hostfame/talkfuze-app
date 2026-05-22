const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/actions/hostnin-knowledge.json');
const knowledge = JSON.parse(fs.readFileSync(p, 'utf8'));

knowledge.plans.forEach(plan => {
  let domains = "Unlimited Domains";
  if (plan.name === "Basic" || plan.name === "WP Starter") domains = "2 Hosted Domains";
  else if (plan.name === "Starter" || plan.name === "WP Pro") domains = "5 Hosted Domains";
  else if (plan.name === "Pro" || plan.name === "WP Ultimate") domains = "Unlimited Hosted Domains";
  else if (plan.name === "Ultimate") domains = "Unlimited Hosted Domains";
  else if (plan.type === "WooCommerce Hosting") {
      if (plan.name === "Basic") domains = "2 Hosted Domains";
      else if (plan.name === "Starter") domains = "5 Hosted Domains";
      else domains = "Unlimited Hosted Domains";
  }

  // Ensure features array exists
  if (!plan.features) {
    plan.features = [];
  }
  
  // Remove existing domain limits if any
  plan.features = plan.features.filter(f => !f.toLowerCase().includes('domain'));

  // Prepend the new domain limit
  plan.features.unshift(domains);
});

fs.writeFileSync(p, JSON.stringify(knowledge, null, 2));
console.log('Successfully updated knowledge JSON with domain limits.');
