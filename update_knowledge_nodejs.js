const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/actions/hostnin-knowledge.json');
const knowledge = JSON.parse(fs.readFileSync(p, 'utf8'));

knowledge.plans.forEach(plan => {
    if (!plan.features) return;

    // We remove Node.js & Python Support from everything except Node.js Hosting
    if (plan.type !== "Node.js Hosting") {
        plan.features = plan.features.filter(f => f !== "Node.js & Python Support");
    }
});

fs.writeFileSync(p, JSON.stringify(knowledge, null, 2));
console.log('Removed Node.js & Python Support from non-Node plans.');
