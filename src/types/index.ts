export interface User {
  id: number;
  username: string;
  avatar?: string;
  is_online?: boolean;
  last_seen?: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  name?: string;
  is_group: boolean;
  created_at: string;
}

export interface ConversationMember {
  id: number;
  conversation_id: number;
  user_id: number;
  role?: 'admin' | 'member';
  is_pinned?: boolean;
  is_archived?: boolean;
  joined_at: string;
  added_by?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'file' | 'poll';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  poll_id?: number;
  reply_to_id?: number;
  reply_to?: Message;
  is_deleted?: boolean;
  is_pinned?: boolean;
  pinned_at?: string;
  pinned_by?: number;
  reactions?: MessageReaction[];
  read_by?: MessageRead[];
  created_at: string;
}

export interface MessageReaction {
  id: number;
  message_id: number;
  user_id: number;
  emoji: string;
  created_at: string;
}

export interface MessageRead {
  id: number;
  message_id: number;
  user_id: number;
  read_at: string;
}

export interface TypingStatus {
  conversation_id: number;
  user_id: number;
  username?: string;
  is_typing: boolean;
  updated_at: string;
}

export interface Poll {
  id: number;
  conversation_id: number;
  creator_id: number;
  question: string;
  is_multiple_choice: boolean;
  is_anonymous: boolean;
  ends_at?: string;
  options: PollOption[];
  created_at: string;
}

export interface PollOption {
  id: number;
  poll_id: number;
  option_text: string;
  votes?: PollVote[];
  vote_count?: number;
}

export interface PollVote {
  id: number;
  poll_id: number;
  option_id: number;
  user_id: number;
  created_at: string;
}

export interface MessageStatus {
  id: number;
  message_id: number;
  user_id: number;
  status: string;
  updated_at: string;
}