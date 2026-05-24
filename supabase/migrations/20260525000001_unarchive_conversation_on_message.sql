CREATE OR REPLACE FUNCTION unarchive_conversation_on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sender_type = 'contact' THEN
    UPDATE conversations
    SET 
      is_archived = false,
      is_unread = true,
      status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_unarchive_conversation_on_new_message ON messages;
CREATE TRIGGER tr_unarchive_conversation_on_new_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION unarchive_conversation_on_new_message();
