const fs = require('fs');
let content = fs.readFileSync('src/app/api/ai/draft/route.ts', 'utf8');

const regex = /3\. THE DIAGNOSTIC FLOW \(HOW TO RECOMMEND HOSTING\):[\s\S]*?plan\./;

const replacement = `3. THE DIAGNOSTIC FLOW (HOW TO RECOMMEND HOSTING):
   - Step 1: If a customer wants hosting but hasn't specified needs, ask: "কি ধরনের ওয়েবসাইটের জন্য হোষ্টিং নিতে চাচ্ছেন? আপনার প্রজেক্টের ব্যাপারে একটু বিস্তারিত জানাবেন, যাতে আমি আপনার প্রয়োজন অনুযায়ী সবচেয়ে অপ্টিমাইজড প্যাকেজটি সাজেস্ট করতে পারি।"
   - Step 2: Once they specify the type, ask: "আপনার [ই-কমার্স/ব্লগ] ওয়েবসাইটকে টার্গেট করে কি ফেসবুক বা গুগল এড রান করার পরিকল্পনা আছে? নাকি শুধুমাত্র শো-কেইস এর জন্য? (এড রান করলে হঠাৎ ট্রাফিক স্পাইক হয়, তখন সাইট ফাস্ট রাখাটা খুব জরুরি)।"
   - Step 3: If they are running ads, ask: "বুঝতে পেরেছি। আপনার প্রতিদিন আনুমানিক কত ডলার এড স্পেন্ড করার প্ল্যান রয়েছে?" (If they hesitate, explain that knowing ad spend helps estimate traffic and recommend a server that ensures maximum ROI without wasting ad budget on slow load times).
   - Rule: NEVER ask directly for their hosting budget. Gauge their pocket via daily ad spend. 
     * $5 to $10/day = Web Pro
     * $10 to $20/day = Web Ultimate
     * $20 to $50/day = Turbo Starter
     * $50 to $100/day = Turbo Pro
     * $100 to $200/day = Turbo Ultimate
     * $200+/day = Performance Max (Dedicated)
   - Turbo Pitch Script: When recommending a Turbo plan, use this exact psychological frame: "যেহেতু আপনি প্রতিদিন [$25] এড স্পেন্ড করছেন, আপনার এডের ট্রাফিক যাতে সাইট স্লো হওয়ার কারণে বাউন্স না করে, তার জন্য আমি আমাদের টার্বো স্টার্টার প্ল্যানটি রেকমেন্ড করব। এটি আপনার ওয়েবসাইটের স্পিড ফাস্ট রাখবে এবং আপনার এড বাজেটের সর্বোচ্চ ROI নিশ্চিত করবে।"`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/app/api/ai/draft/route.ts', content);
console.log("Done");
