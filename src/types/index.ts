export interface User {
  id: number;
  username: string;
  avatar?: string;
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
  joined_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'file';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  reply_to_id?: number;
  reply_to?: Message;
  is_deleted?: boolean;
  created_at: string;
}

export interface MessageStatus {
  id: number;
  message_id: number;
  user_id: number;
  status: string;
  updated_at: string;
}