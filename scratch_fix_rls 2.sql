BEGIN;

DROP POLICY IF EXISTS "Users can see chats they are a member of" ON team_chats;
DROP POLICY IF EXISTS "Users can see members of their chats" ON team_chat_members;
DROP POLICY IF EXISTS "Users can read messages in their chats" ON team_messages;
DROP POLICY IF EXISTS "Users can insert messages into their chats" ON team_messages;

-- 1. team_chats: Visible to anyone in the same org
CREATE POLICY "Users can see chats in their org"
ON team_chats FOR SELECT
USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
);

-- 2. team_chat_members: Visible to anyone in the same org
CREATE POLICY "Users can see chat members in their org"
ON team_chat_members FOR SELECT
USING (
    chat_id IN (
        SELECT id FROM team_chats WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
    )
);

-- 3. team_messages: Only visible if you are explicitly a member of that chat
CREATE POLICY "Users can read messages in their chats"
ON team_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM team_chat_members
        WHERE chat_id = team_messages.chat_id AND user_id = auth.uid()
    )
);

-- 4. team_messages insert: Only if you are a member
CREATE POLICY "Users can insert messages into their chats"
ON team_messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM team_chat_members
        WHERE chat_id = team_messages.chat_id AND user_id = auth.uid()
    )
    AND sender_id = auth.uid()
);

COMMIT;
