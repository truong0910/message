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

-- 5. Cập nhật role cho những thành viên đã tạo conversation (đặt làm admin)
UPDATE conversation_members cm
SET role = 'admin'
FROM conversations c
WHERE cm.conversation_id = c.id 
  AND cm.user_id = c.created_by
  AND cm.role IS NULL;

-- 6. RLS Policies cho conversation_members
-- Xóa policy cũ nếu có
DROP POLICY IF EXISTS "Users can view conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Users can insert conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Admins can update conversation members" ON conversation_members;
DROP POLICY IF EXISTS "Admins can delete conversation members" ON conversation_members;

-- Tạo policy mới
CREATE POLICY "Users can view conversation members" ON conversation_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm2 
      WHERE cm2.conversation_id = conversation_members.conversation_id 
      AND cm2.user_id = auth.uid()::integer
    )
  );

CREATE POLICY "Users can insert conversation members" ON conversation_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_members cm 
      WHERE cm.conversation_id = conversation_members.conversation_id 
      AND cm.user_id = auth.uid()::integer 
      AND cm.role = 'admin'
    )
    OR 
    -- Cho phép tự thêm khi tạo conversation mới
    conversation_members.user_id = auth.uid()::integer
  );

CREATE POLICY "Admins can update conversation members" ON conversation_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm 
      WHERE cm.conversation_id = conversation_members.conversation_id 
      AND cm.user_id = auth.uid()::integer 
      AND cm.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete conversation members" ON conversation_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversation_members cm 
      WHERE cm.conversation_id = conversation_members.conversation_id 
      AND cm.user_id = auth.uid()::integer 
      AND cm.role = 'admin'
    )
    OR 
    -- Cho phép tự rời khỏi nhóm
    conversation_members.user_id = auth.uid()::integer
  );

-- 7. Cập nhật policy cho messages để support ghim
DROP POLICY IF EXISTS "Users can update message pins" ON messages;

CREATE POLICY "Users can update message pins" ON messages
  FOR UPDATE USING (
    -- Chỉ update tin nhắn trong conversation mà user là thành viên
    EXISTS (
      SELECT 1 FROM conversation_members cm 
      WHERE cm.conversation_id = messages.conversation_id 
      AND cm.user_id = auth.uid()::integer
    )
  );

-- 8. Enable RLS nếu chưa enable
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- XONG! Các tính năng đã được kích hoạt:
-- ✅ Tạo nhóm với tên
-- ✅ Phân quyền admin/member
-- ✅ Thêm/xóa thành viên (admin only)
-- ✅ Ghim/bỏ ghim tin nhắn
-- =====================================================
