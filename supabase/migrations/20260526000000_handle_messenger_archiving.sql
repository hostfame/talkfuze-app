CREATE OR REPLACE FUNCTION unarchive_conversation_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  conv_channel_type text;
BEGIN
  IF NEW.sender_type = 'contact' THEN
    -- Get the channel type for this conversation
    SELECT c.type INTO conv_channel_type
    FROM conversations conv
    JOIN channels c ON conv.channel_id = c.id
    WHERE conv.id = NEW.conversation_id;

    IF conv_channel_type = 'messenger' THEN
      -- For messenger, automatically archive it and do NOT mark as unread
      UPDATE conversations
      SET 
        is_archived = true,
        is_unread = false
      WHERE id = NEW.conversation_id;
    ELSE
      -- For all other channels, unarchive and mark unread
      UPDATE conversations
      SET 
        is_archived = false,
        is_unread = true,
        status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
      WHERE id = NEW.conversation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
