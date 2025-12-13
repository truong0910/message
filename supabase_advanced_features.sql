-- =====================================================
-- ADVANCED CHAT FEATURES - DATABASE SCHEMA
-- =====================================================

-- 1. MESSAGE REACTIONS (Reactions cho tin nhắn)
CREATE TABLE IF NOT EXISTS message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL, -- 👍❤️😂😮😢😡
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji) -- Mỗi user chỉ react 1 emoji 1 lần
);

-- 2. READ RECEIPTS (Đã xem tin nhắn)
CREATE TABLE IF NOT EXISTS message_reads (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- 3. USER PRESENCE (Online/Offline status)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;

-- 4. TYPING INDICATORS (Đang nhập)
CREATE TABLE IF NOT EXISTS typing_status (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_typing BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- 5. PINNED MESSAGES (Ghim tin nhắn)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES users(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id INTEGER REFERENCES polls(id) ON DELETE SET NULL;

-- 6. GROUP CHAT ENHANCEMENTS
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member'; -- 'admin', 'member'
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP DEFAULT NOW();
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS added_by INTEGER REFERENCES users(id);

-- 7. PINNED CONVERSATIONS (Pin đoạn hội thoại)
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- 8. POLLS (Bình chọn)
CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  is_multiple_choice BOOLEAN DEFAULT FALSE,
  is_anonymous BOOLEAN DEFAULT FALSE,
  ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  option_text VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  option_id INTEGER REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(poll_id, option_id, user_id)
);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE typing_status;
ALTER PUBLICATION supabase_realtime ADD TABLE polls;
ALTER PUBLICATION supabase_realtime ADD TABLE poll_votes;

-- RLS Policies
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all for message_reactions" ON message_reactions FOR ALL USING (true);
CREATE POLICY "Allow all for message_reads" ON message_reads FOR ALL USING (true);
CREATE POLICY "Allow all for typing_status" ON typing_status FOR ALL USING (true);
CREATE POLICY "Allow all for polls" ON polls FOR ALL USING (true);
CREATE POLICY "Allow all for poll_options" ON poll_options FOR ALL USING (true);
CREATE POLICY "Allow all for poll_votes" ON poll_votes FOR ALL USING (true);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_typing_status_conv ON typing_status(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_content ON messages USING gin(to_tsvector('simple', content));
