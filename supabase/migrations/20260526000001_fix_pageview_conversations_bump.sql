CREATE OR REPLACE FUNCTION unarchive_conversation_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  conv_channel_type text;
  is_page_view boolean;
BEGIN
  -- Determine if this is a page view system message
  is_page_view := (NEW.metadata->>'event' = 'page_view' OR NEW.content LIKE 'Viewed:%');

  IF NOT is_page_view THEN
    -- Update last_message_at for non-page-view messages
    UPDATE conversations 
    SET last_message_at = NEW.created_at 
    WHERE id = NEW.conversation_id;

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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
