with open('/Users/imran/Documents/Talkfuze/src/app/widget/[org_id]/page.tsx', 'r') as f:
    content = f.read()

target = "avatarUrl: lastAgentMsg.agent.avatar_url"
replace = "avatarUrl: lastAgentMsg.agent?.avatar_url"
content = content.replace(target, replace)

with open('/Users/imran/Documents/Talkfuze/src/app/widget/[org_id]/page.tsx', 'w') as f:
    f.write(content)
