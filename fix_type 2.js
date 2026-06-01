const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');
content = content.replace(/videoLinks\.map\(\(link, lIdx\) =>/g, "videoLinks.map((link: string, lIdx: number) =>");
fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);

console.log("Fixed types");
