-- Thêm các cột cho reply và delete vào bảng messages
-- Chạy SQL này trong Supabase SQL Editor

-- Thêm cột reply_to_id để reference tin nhắn đang trả lời
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;

-- Thêm cột is_deleted để soft delete tin nhắn
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Index để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted);
