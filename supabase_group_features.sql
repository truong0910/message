-- =====================================================
-- SQL Script: Group Chat & Pin Message Features
-- Chạy script này trong Supabase SQL Editor
-- =====================================================

-- 1. Thêm cột created_by vào conversations (nếu chưa có)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- 2. Thêm các cột cho conversation_members (nếu chưa có)
ALTER TABLE conversation_members 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member';

ALTER TABLE conversation_members 
ADD COLUMN IF NOT EXISTS added_by INTEGER REFERENCES users(id);

ALTER TABLE conversation_members 
ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Thêm các cột cho ghim tin nhắn vào messages (nếu chưa có)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES users(id);

-- 4. Tạo index để tối ưu query
CREATE INDEX IF NOT EXISTS idx_messages_pinned 
ON messages(conversation_id, is_pinned) 
WHERE is_pinned = TRUE;

CREATE INDEX IF NOT EXISTS idx_conversation_members_role 
ON conversation_members(conversation_id, role);

-- 5. Xóa các policy cũ nếu có (để tránh conflict)
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can insert conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Admins can update conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Admins can delete conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can update message pins" ON messages;
DROP POLICY IF EXISTS "Allow all for conversation_members" ON conversation_members;
DROP POLICY IF EXISTS "Allow all for messages" ON messages;

-- 6. Tạo policy đơn giản cho conversation_members
-- (App sử dụng custom auth, không dùng Supabase Auth)
CREATE POLICY "Allow all for conversation_members" ON conversation_members
  FOR ALL USING (true) WITH CHECK (true);

-- 7. Tạo/cập nhật policy cho messages
-- Kiểm tra xem đã có policy chưa
DO $$
BEGIN
  -- Nếu chưa có policy nào cho messages, tạo mới
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' AND policyname = 'Allow all for messages'
  ) THEN
    CREATE POLICY "Allow all for messages" ON messages
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. Enable RLS
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 9. Cập nhật role = 'member' cho những record chưa có role
UPDATE conversation_members 
SET role = 'member' 
WHERE role IS NULL;

-- =====================================================
-- XONG! Các tính năng đã được kích hoạt:
-- ✅ Tạo nhóm với tên
-- ✅ Phân quyền admin/member
-- ✅ Thêm/xóa thành viên (admin only)
-- ✅ Ghim/bỏ ghim tin nhắn
-- =====================================================
