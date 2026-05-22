const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'src/actions/hostnin-knowledge.json');
const knowledge = JSON.parse(fs.readFileSync(p, 'utf8'));

knowledge.plans.forEach(plan => {
    if (!plan.features) plan.features = [];

    // Filter out previous instances if we run this multiple times
    const removeKeywords = [
        "Node.js", "AI Website Builder", "E-Commerce", "Free .COM", "Free Staging",
        "Priority Malware", "White-Glove", "Speed Optimization Audit", "Core Web Vitals",
        "LiteSpeed", "Free Website Transfer", "WooCommerce Analytics", "Multi-Vendor Support"
    ];
    
    plan.features = plan.features.filter(f => !removeKeywords.some(kw => f.includes(kw)));

    const { type, name, period } = plan;
    const isYearlyOrMore = period === 'yearly' || period === '3-years';

    // Free .COM Domain Logic
    if (type === "Web Hosting" || type === "BDIX Hosting" || type === "Cloud Hosting") {
        if (isYearlyOrMore && name !== "Basic") {
            plan.features.push("Free .COM Domain");
        }
    } else if (type === "Turbo NVMe Hosting") {
        if (isYearlyOrMore) {
            plan.features.push("Free .COM Domain");
        }
    } else if (type === "WooCommerce Hosting") {
        if (isYearlyOrMore) {
            plan.features.push("Free .COM Domain");
        }
    }

    // Web Hosting
    if (type === "Web Hosting" || type === "Cloud Hosting") {
        if (name === "Starter" || name === "Pro" || name === "Ultimate") {
            plan.features.push("Node.js & Python Support");
        }
        if (name === "Pro" || name === "Ultimate") {
            plan.features.push("AI Website Builder");
            plan.features.push("E-Commerce Optimized");
            plan.features.push("Priority Malware Removal");
        }
    }

    // BDIX Hosting
    if (type === "BDIX Hosting") {
        if (name === "Starter" || name === "Pro" || name === "Ultimate") {
            plan.features.push("Node.js & Python Support");
            plan.features.push("AI Website Builder");
        }
        if (name === "Pro" || name === "Ultimate") {
            plan.features.push("E-Commerce Ready");
            plan.features.push("Priority Malware Removal");
        }
    }

    // Turbo NVMe Hosting
    if (type === "Turbo NVMe Hosting") {
        plan.features.push("LiteSpeed & LSCache Included");
        plan.features.push("Node.js & Python Support");
        plan.features.push("Free Website Transfer");

        if (name === "Starter" || name === "Pro" || name === "Ultimate") {
            plan.features.push("Free Staging Site");
        }
        if (name === "Pro" || name === "Ultimate") {
            plan.features.push("Priority Malware Removal");
            plan.features.push("Core Web Vitals Guarantee");
            plan.features.push("White-Glove Setup");
        }
        if (name === "Ultimate") {
            plan.features.push("Speed Optimization Audit");
        }
    }

    // WooCommerce Hosting
    if (type === "WooCommerce Hosting") {
        if (name === "Starter" || name === "Pro" || name === "Ultimate") {
            plan.features.push("WooCommerce Analytics & SEO Tools");
        }
        if (name === "Pro" || name === "Ultimate") {
            plan.features.push("Multi-Vendor Support (Dokan/WCFM)");
        }
    }
});

fs.writeFileSync(p, JSON.stringify(knowledge, null, 2));
console.log('Successfully added premium features to knowledge JSON.');
